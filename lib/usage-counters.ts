/**
 * Atomic usage counters (PRD §21.3 — the real cost ceiling).
 *
 * `reserveCalls(...)` does a single INSERT ... ON CONFLICT ... DO UPDATE ...
 * RETURNING that increments a column and returns the post-increment value.
 * Callers compare the returned count to the plan budget BEFORE issuing the
 * external API call. This is race-safe under concurrent worker fan-out —
 * never an "increment first then over-spend" scenario.
 *
 * Counters:
 *   - serp_calls         : SERP discovery (~0.10/call territory)
 *   - scrape_calls       : standard scrape AND enrichment fetches
 *   - sources_stored     : after dedup upsert, only when a NEW row was created
 *   - signals_generated  : per signal row inserted
 *   - social_fetches     : Apify Instagram profile results (Competitor Hub)
 *
 * `cap_notice_sent_at` lets the worker send the Resend usage email exactly
 * once per cycle (PRD §21.4 — never silently keep spending after a cap).
 */
import { sql, requireSql } from "./db";
import { currentPeriodStart } from "./usage";

export type CounterName = "serp_calls" | "scrape_calls" | "sources_stored" | "signals_generated" | "social_fetches";

export interface UsageRow {
  serp_calls: number;
  scrape_calls: number;
  sources_stored: number;
  signals_generated: number;
  social_fetches: number;
  cap_notice_sent_at: string | null;
}

/** Read the current period's row (or zeros if not yet created). */
export async function getUsage(userId: string, periodStart = currentPeriodStart()): Promise<UsageRow> {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT serp_calls, scrape_calls, sources_stored, signals_generated, social_fetches, cap_notice_sent_at
    FROM usage_counters
    WHERE user_id = ${userId} AND period_start = ${periodStart}
    LIMIT 1
  `) as UsageRow[];
  return rows[0] ?? {
    serp_calls: 0, scrape_calls: 0, sources_stored: 0, signals_generated: 0, social_fetches: 0, cap_notice_sent_at: null,
  };
}

/**
 * Atomic reserve. Returns the post-increment value of `counter` for the
 * current period, after adding `delta` (default 1). Callers compare this
 * to the plan budget and abort if it would exceed.
 *
 * Race-safe: the INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING runs as
 * a single statement, so concurrent workers never both see "ok, still under
 * budget" and both spend.
 */
export async function reserveCalls(
  userId: string,
  counter: CounterName,
  delta = 1,
  periodStart = currentPeriodStart(),
): Promise<number> {
  const sqlClient = requireSql();

  // Switch on the counter column to keep the dynamic SQL safe (no string
  // interpolation of identifiers into the query).
  if (counter === "serp_calls") {
    const rows = (await sqlClient`
      INSERT INTO usage_counters (user_id, period_start, serp_calls)
      VALUES (${userId}, ${periodStart}, ${delta})
      ON CONFLICT (user_id, period_start) DO UPDATE
        SET serp_calls = usage_counters.serp_calls + EXCLUDED.serp_calls,
            updated_at = now()
      RETURNING serp_calls
    `) as { serp_calls: number }[];
    return rows[0]?.serp_calls ?? delta;
  }
  if (counter === "scrape_calls") {
    const rows = (await sqlClient`
      INSERT INTO usage_counters (user_id, period_start, scrape_calls)
      VALUES (${userId}, ${periodStart}, ${delta})
      ON CONFLICT (user_id, period_start) DO UPDATE
        SET scrape_calls = usage_counters.scrape_calls + EXCLUDED.scrape_calls,
            updated_at = now()
      RETURNING scrape_calls
    `) as { scrape_calls: number }[];
    return rows[0]?.scrape_calls ?? delta;
  }
  if (counter === "sources_stored") {
    const rows = (await sqlClient`
      INSERT INTO usage_counters (user_id, period_start, sources_stored)
      VALUES (${userId}, ${periodStart}, ${delta})
      ON CONFLICT (user_id, period_start) DO UPDATE
        SET sources_stored = usage_counters.sources_stored + EXCLUDED.sources_stored,
            updated_at = now()
      RETURNING sources_stored
    `) as { sources_stored: number }[];
    return rows[0]?.sources_stored ?? delta;
  }
  if (counter === "social_fetches") {
    const rows = (await sqlClient`
      INSERT INTO usage_counters (user_id, period_start, social_fetches)
      VALUES (${userId}, ${periodStart}, ${delta})
      ON CONFLICT (user_id, period_start) DO UPDATE
        SET social_fetches = usage_counters.social_fetches + EXCLUDED.social_fetches,
            updated_at = now()
      RETURNING social_fetches
    `) as { social_fetches: number }[];
    return rows[0]?.social_fetches ?? delta;
  }
  // signals_generated
  const rows = (await sqlClient`
    INSERT INTO usage_counters (user_id, period_start, signals_generated)
    VALUES (${userId}, ${periodStart}, ${delta})
    ON CONFLICT (user_id, period_start) DO UPDATE
      SET signals_generated = usage_counters.signals_generated + EXCLUDED.signals_generated,
          updated_at = now()
    RETURNING signals_generated
  `) as { signals_generated: number }[];
  return rows[0]?.signals_generated ?? delta;
}

/** Atomically claim the right to send the cap-notice email this cycle. */
export async function claimCapNotice(userId: string, periodStart = currentPeriodStart()): Promise<boolean> {
  const sqlClient = requireSql();
  const rows = (await sqlClient`
    UPDATE usage_counters
    SET cap_notice_sent_at = now()
    WHERE user_id = ${userId}
      AND period_start = ${periodStart}
      AND cap_notice_sent_at IS NULL
    RETURNING id
  `) as { id: string }[];
  return rows.length > 0;
}
