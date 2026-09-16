import { createHash, randomUUID } from "node:crypto";
import { currentPeriodStart } from "./usage";
import { withTx } from "./db";
import type { SignalItem } from "./schemas/ai";

export const ANALYZER_VERSION = "signals-v1";
export interface AnalysisVersion {
  id: string; source_id: string; title: string; url: string;
  cleaned_text: string; prior_cleaned_text: string | null; last_changed_at: string | null;
  result_signals: SignalItem[] | null; result_index: number;
}
export function signalFingerprint(signal: { title: string; description: string; category: string }): string {
  const normalize = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(JSON.stringify([signal.category, normalize(signal.title), normalize(signal.description)])).digest("hex");
}
export async function claimAnalysis(projectId: string, limit: number) {
  const token = randomUUID();
  const versions = await withTx(async (client) => {
    const { rows } = await client.query<AnalysisVersion>(`
      WITH picked AS (
        SELECT id FROM source_analysis_versions
        WHERE project_id=$1 AND analyzer_version=$2 AND completed_at IS NULL AND expired_at IS NULL
          AND cleaned_text IS NOT NULL
          AND available_at <= now() AND (lease_until IS NULL OR lease_until <= clock_timestamp())
        ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT $3
      ) UPDATE source_analysis_versions v SET claim_token=$4, lease_until=clock_timestamp()+interval '5 minutes', attempts=attempts+1
        FROM picked WHERE v.id=picked.id RETURNING v.*`, [projectId, ANALYZER_VERSION, limit, token]);
    return rows;
  });
  return { token, versions };
}
export async function releaseAnalysis(token: string) {
  await withTx(async (client) => {
    await client.query(`UPDATE source_analysis_versions SET claim_token=NULL, lease_until=NULL,
      available_at=now()+LEAST(attempts,60)*interval '1 minute'
      WHERE claim_token=$1 AND completed_at IS NULL AND expired_at IS NULL`, [token]);
  });
}

/** Persist model results, publication cursor, fingerprints and signals together.
 * The project lock serializes the daily cap; claimed rows fence expired workers.
 * Results deferred by the cap are cached, so tomorrow need not call the model. */
export async function finishAnalysis(projectId: string, token: string, results: Map<string, SignalItem[]>, dailyLimit: number) {
  return withTx(async (client) => {
    const { rows: owners } = await client.query<{ user_id: string; publication_time: Date }>(
      "SELECT user_id, now() AS publication_time FROM projects WHERE id=$1 FOR UPDATE", [projectId]);
    if (!owners[0]) throw new Error("Analysis project unavailable");
    const { rows: versions } = await client.query<AnalysisVersion>(`SELECT * FROM source_analysis_versions
      WHERE project_id=$1 AND claim_token=$2 AND lease_until>clock_timestamp() AND completed_at IS NULL AND expired_at IS NULL
      ORDER BY created_at,id FOR UPDATE`, [projectId, token]);
    const { rows: counts } = await client.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM signals
      WHERE project_id=$1 AND created_at >= date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`, [projectId]);
    let remaining = Math.max(0, dailyLimit - counts[0].n);
    let inserted = 0, duplicates = 0;
    for (const version of versions) {
      const candidates = version.result_signals ?? results.get(version.id);
      if (!candidates) continue;
      let cursor = version.result_index;
      for (; cursor < candidates.length; cursor++) {
        const signal = candidates[cursor];
        const fingerprint = signalFingerprint(signal);
        // Legacy signals have no fingerprint. Exact normalized comparison avoids
        // re-publishing their unchanged content during the one-time queue seed.
        const { rows: prior } = await client.query<{ id: string; title: string; description: string; category: string }>(`
          SELECT s.id,s.title,s.description,s.category FROM signals s JOIN signal_sources ss ON ss.signal_id=s.id
          WHERE s.project_id=$1 AND ss.source_id=$2 AND s.category=$3`, [projectId, version.source_id, signal.category]);
        const { rows: existing } = await client.query(`SELECT 1 FROM source_signal_fingerprints
          WHERE project_id=$1 AND source_id=$2 AND fingerprint=$3`, [projectId, version.source_id, fingerprint]);
        const legacy = prior.find((s) => signalFingerprint(s) === fingerprint);
        if (existing.length || legacy) {
          if (legacy && !existing.length) await client.query("INSERT INTO source_signal_fingerprints(project_id,source_id,fingerprint,signal_id) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [projectId, version.source_id, fingerprint, legacy.id]);
          duplicates++; continue;
        }
        if (remaining === 0) break;
        const { rows } = await client.query<{ id: string }>(`INSERT INTO signals
          (project_id,title,category,description,importance,confidence_score,suggested_action)
          VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [projectId, signal.title, signal.category, signal.description, signal.importance, signal.confidence_score, signal.suggested_action || null]);
        await client.query("INSERT INTO signal_sources(signal_id,source_id) VALUES ($1,$2)", [rows[0].id, version.source_id]);
        await client.query("INSERT INTO source_signal_fingerprints(project_id,source_id,fingerprint,signal_id) VALUES ($1,$2,$3,$4)", [projectId, version.source_id, fingerprint, rows[0].id]);
        remaining--; inserted++;
      }
      const complete = cursor === candidates.length;
      await client.query(`UPDATE source_analysis_versions SET result_signals=$2::jsonb, result_index=$3,
        completed_at=CASE WHEN $4 THEN now() ELSE NULL END, claim_token=NULL, lease_until=NULL,
        available_at=CASE WHEN $4 THEN now() ELSE (date_trunc('day',now() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC' END
        WHERE id=$1`, [version.id, JSON.stringify(candidates), cursor, complete]);
    }
    if (inserted) {
      // Same owner and UTC-month period semantics as reserveCalls, committed with
      // the publication transaction. A counter failure rolls back everything.
      await client.query(`INSERT INTO usage_counters(user_id,period_start,signals_generated)
        VALUES ($1,$2,$3) ON CONFLICT(user_id,period_start) DO UPDATE
        SET signals_generated=usage_counters.signals_generated+EXCLUDED.signals_generated,updated_at=now()`,
      [owners[0].user_id, currentPeriodStart(new Date(owners[0].publication_time)), inserted]);
    }
    return { inserted, duplicates, finalized: versions.length };
  });
}
