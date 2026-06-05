import { z } from "zod";
import { sql } from "./db";

/** JSON helpers — all routes use these to keep responses uniform. */
export function json<T>(data: T, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
}
export function badRequest(detail: unknown, status = 400) {
  return json({ error: "Bad request", detail }, { status });
}
export function notFound() { return json({ error: "Not found" }, { status: 404 }); }
export function forbidden() { return json({ error: "Forbidden" }, { status: 403 }); }
export function conflict(message: string) { return json({ error: message }, { status: 409 }); }
export function rateLimited(message: string) { return json({ error: message }, { status: 429 }); }
export function serverError(message: string) { return json({ error: message }, { status: 500 }); }

/** Parse JSON body and Zod-validate, returning a 400 Response on failure. */
export async function parseJson<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Body must be JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.issues);
  return parsed.data;
}

/**
 * Ownership check: ensure a project belongs to the given user. Returns the
 * project row when authorized, or null when missing/unauthorized — caller
 * decides between 404 and 403 (we lean 404 to avoid leaking existence).
 */
export async function ownedProject<T = Record<string, unknown>>(userId: string, projectId: string): Promise<T | null> {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT * FROM projects WHERE id = ${projectId} AND user_id = ${userId} LIMIT 1
  `) as T[];
  return rows[0] ?? null;
}

/**
 * Ownership for child rows that don't carry user_id directly. Joins back to
 * projects.user_id for the authenticated user.
 */
export async function ownedCompetitor(userId: string, competitorId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT c.* FROM competitors c
    JOIN projects p ON p.id = c.project_id
    WHERE c.id = ${competitorId} AND p.user_id = ${userId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function ownedKeyword(userId: string, keywordId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT k.* FROM keywords k
    JOIN projects p ON p.id = k.project_id
    WHERE k.id = ${keywordId} AND p.user_id = ${userId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function ownedSignal(userId: string, signalId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT s.* FROM signals s
    JOIN projects p ON p.id = s.project_id
    WHERE s.id = ${signalId} AND p.user_id = ${userId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}
