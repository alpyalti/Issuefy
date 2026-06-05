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
const R2_ENABLED = process.env.R2_ENABLED === "true";

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function loadConfig(): R2Config | null {
  if (!R2_ENABLED) return null;
  const accountId = process.env.R2_ACCOUNT_ID || "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || "";
  const bucket = process.env.R2_BUCKET || "";
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

/**
 * Archive raw HTML to R2. Returns a storage key on success, null otherwise.
 * `key` is the object path; for sources we use `raw/<source_id>.html`.
 */
export async function archiveRawHtml(key: string, html: string): Promise<string | null> {
  const cfg = loadConfig();
  if (!cfg) return null;

  try {
    // Dynamic import to avoid pulling the AWS SDK into the bundle when disabled.
    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      region: "auto",
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    });
    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: html,
      ContentType: "text/html; charset=utf-8",
    }));
    return key;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[r2] archive failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}
