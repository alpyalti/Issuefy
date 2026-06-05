/**
 * Shared header-bearer guards for cron + internal worker routes.
 *
 *   /api/cron/**          → Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 *   /api/internal/**      → the dispatcher sends `Authorization: Bearer <INTERNAL_WORKER_SECRET>`
 *
 * Neither is gated by Clerk (the middleware exempts them); the bearer header
 * IS the auth. Both secrets are pre-generated random 32-byte hex strings —
 * see .env. Constant-time compare prevents timing oracles on the secret.
 */
import { timingSafeEqual } from "node:crypto";

function safeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function bearer(req: Request): string {
  const h = req.headers.get("authorization") || "";
  if (!h.toLowerCase().startsWith("bearer ")) return "";
  return h.slice(7).trim();
}

export function checkCronSecret(req: Request): Response | null {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return new Response("CRON_SECRET not configured", { status: 503 });
  if (!safeEq(bearer(req), secret)) return new Response("Unauthorized", { status: 401 });
  return null;
}

export function checkInternalSecret(req: Request): Response | null {
  const secret = process.env.INTERNAL_WORKER_SECRET || "";
  if (!secret) return new Response("INTERNAL_WORKER_SECRET not configured", { status: 503 });
  if (!safeEq(bearer(req), secret)) return new Response("Unauthorized", { status: 401 });
  return null;
}
