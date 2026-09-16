import { randomUUID } from "node:crypto";
import { requireSql } from "./db";
import { configuredEnv } from "./env";
/**
 * Optional Cloudflare R2 storage (PRD §10.6).
 *
 * Cleaned text lives in Neon — that's the source of truth (PRD §10.5). R2 is
 * ONLY used to archive raw HTML when R2_ENABLED=true. When disabled (default),
 * both functions no-op and the `r2_raw_html_key` column stays null.
 *
 * A failed R2 write must NEVER fail the scrape (PRD §10.6 / §13.2). Callers
 * treat the returned key as best-effort.
 */


interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function loadConfig(): R2Config | null {
  if (process.env.R2_ENABLED !== "true") return null;
  const accountId = configuredEnv(process.env.R2_ACCOUNT_ID) || "";
  const accessKeyId = configuredEnv(process.env.R2_ACCESS_KEY_ID) || "";
  const secretAccessKey = configuredEnv(process.env.R2_SECRET_ACCESS_KEY) || "";
  const bucket = configuredEnv(process.env.R2_BUCKET) || "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * Archive raw HTML to R2. Returns a storage key on success, null otherwise.
 * New source keys are unique per attempt, never timestamp-only.
 */
export async function archiveRawHtml(key: string, html: string): Promise<string | null> {
  const cfg = loadConfig();
  if (!cfg) return null;

  try {
    // Reserve cleanup BEFORE upload: crashes or failed DB attachment leave a
    // durable orphan record. The source trigger removes it on attachment.
    const sql = requireSql();
    await sql`INSERT INTO storage_cleanup_jobs(object_key, available_at)
      VALUES (${key}, now() + interval '1 day') ON CONFLICT DO NOTHING`;
    // Dynamic import to avoid pulling the AWS SDK into the bundle when disabled.
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "auto",
      maxAttempts: 2,
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    try { await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: html,
      ContentType: "text/html; charset=utf-8",
    }), { abortSignal: AbortSignal.timeout(15000) });
    return key;
    } finally { client.destroy(); }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[r2] archive failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}


export function sourceArchiveKey(projectId: string): string {
  return `raw/${projectId}/${randomUUID()}.html`;
}

/** Bounded, idempotent deletes. Failed/disabled storage keeps its durable jobs. */
export async function drainStorageCleanup(): Promise<{ deleted: number; failed: number; disabled: boolean }> {
  const cfg = loadConfig();
  if (!cfg) return { deleted: 0, failed: 0, disabled: true };
  const sql = requireSql();
  const token = randomUUID();
  const jobs = await sql`WITH due AS (
    SELECT j.object_key FROM storage_cleanup_jobs j
    WHERE j.completed_at IS NULL AND j.available_at <= now() AND (j.lease_until IS NULL OR j.lease_until < now())
      AND NOT EXISTS (SELECT 1 FROM sources s WHERE s.r2_raw_html_key = j.object_key)
    ORDER BY j.available_at, j.object_key LIMIT 10 FOR UPDATE OF j SKIP LOCKED
  ) UPDATE storage_cleanup_jobs j SET lease_token = ${token}::uuid,
      lease_until = now() + interval '5 minutes', attempts = attempts + 1,
      cleanup_started_at = COALESCE(cleanup_started_at, now())
    FROM due WHERE j.object_key = due.object_key RETURNING j.object_key`;
  const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({ region: "auto", maxAttempts: 2,
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey } });
  let deleted = 0, failed = 0;
  try {
    for (const job of jobs) {
      try {
        // Cleanup is restricted to application-owned raw HTML paths.
        if (!/^raw\/[0-9a-f-]{36}\/(?:[0-9a-f-]{36}|[0-9]+)\.html$/i.test(job.object_key)) {
          throw new Error("Unsupported archive key");
        }
        await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: job.object_key }),
          { abortSignal: AbortSignal.timeout(15000) });
        await sql`UPDATE storage_cleanup_jobs SET completed_at = now(), lease_token = NULL,
          lease_until = NULL WHERE object_key = ${job.object_key} AND lease_token = ${token}::uuid`;
        deleted++;
      } catch {
        failed++;
        await sql`UPDATE storage_cleanup_jobs SET lease_token = NULL, lease_until = NULL,
          available_at = now() + interval '1 hour' * LEAST(attempts, 24)
          WHERE object_key = ${job.object_key} AND lease_token = ${token}::uuid`;
      }
    }
  } finally { client.destroy(); }
  return { deleted, failed, disabled: false };
}
