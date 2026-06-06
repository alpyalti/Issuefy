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

/* ─────────────────────────────────────────────────────────────────────
   Project access checks (migration 0009 — teams).

   Before teams, a user could touch a project iff projects.user_id matched.
   Now the source of truth is project_members: every owner gets an explicit
   owner-membership row (mirrored on insert + backfill 0009), and editors /
   viewers are added via the team flow. The three roles:

     owner  → full control + billing + team management
     editor → full data control (no billing, no team)
     viewer → read-only

   The "owned*" helpers below keep their old names + signatures so we don't
   churn every API route in this commit. They've quietly been widened to
   "any member" — owners still pass, and editors/viewers (once added in
   later phases) pass too. The tightened helpers (manageableProject,
   adminProject) are what mutating + owner-only routes opt into.
   ───────────────────────────────────────────────────────────────────── */

export type ProjectRole = "owner" | "editor" | "viewer";

/**
 * Project + the caller's role on it. null when the caller has no membership.
 * Returns the project row augmented with current_user_role for callers that
 * want to gate UI by role without a second query.
 */
export async function accessibleProject<T = Record<string, unknown>>(
  userId: string,
  projectId: string,
): Promise<(T & { current_user_role: ProjectRole }) | null> {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT p.*, pm.role AS current_user_role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = ${projectId} AND pm.user_id = ${userId}
     LIMIT 1
  `) as Array<T & { current_user_role: ProjectRole }>;
  return rows[0] ?? null;
}

/**
 * Same as accessibleProject but tightened to roles allowed to MUTATE project
 * data (watchlist, signals, name/industry/target_market). Owners + editors.
 * Use this on POST/PATCH/DELETE routes touching project-scoped data.
 */
export async function manageableProject<T = Record<string, unknown>>(
  userId: string,
  projectId: string,
): Promise<(T & { current_user_role: "owner" | "editor" }) | null> {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT p.*, pm.role AS current_user_role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = ${projectId}
       AND pm.user_id = ${userId}
       AND pm.role IN ('owner','editor')
     LIMIT 1
  `) as Array<T & { current_user_role: "owner" | "editor" }>;
  return rows[0] ?? null;
}

/**
 * Owner-only access — billing, team management, project deletion, and the
 * company-profile fields on PATCH /api/projects/:id.
 */
export async function adminProject<T = Record<string, unknown>>(
  userId: string,
  projectId: string,
): Promise<(T & { current_user_role: "owner" }) | null> {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT p.*, 'owner'::text AS current_user_role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = ${projectId}
       AND pm.user_id = ${userId}
       AND pm.role = 'owner'
     LIMIT 1
  `) as Array<T & { current_user_role: "owner" }>;
  return rows[0] ?? null;
}

/**
 * ownedProject — back-compat alias. Was "the user owns this project"; now
 * "the user is a member (any role)". Owners still pass; once editors/viewers
 * exist, they pass too. Tighten individual routes to manageableProject or
 * adminProject as needed.
 */
export async function ownedProject<T = Record<string, unknown>>(userId: string, projectId: string): Promise<T | null> {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT p.* FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = ${projectId} AND pm.user_id = ${userId}
     LIMIT 1
  `) as T[];
  return rows[0] ?? null;
}

/**
 * Ownership for child rows. Joins back to projects → project_members for the
 * authenticated user. Any role can access; tighten with the *Manage variants
 * for mutating endpoints.
 */
export async function ownedCompetitor(userId: string, competitorId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT c.* FROM competitors c
    JOIN projects p ON p.id = c.project_id
    JOIN project_members pm ON pm.project_id = p.id
    WHERE c.id = ${competitorId} AND pm.user_id = ${userId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function manageableCompetitor(userId: string, competitorId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT c.* FROM competitors c
    JOIN projects p ON p.id = c.project_id
    JOIN project_members pm ON pm.project_id = p.id
    WHERE c.id = ${competitorId}
      AND pm.user_id = ${userId}
      AND pm.role IN ('owner','editor')
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function ownedKeyword(userId: string, keywordId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT k.* FROM keywords k
    JOIN projects p ON p.id = k.project_id
    JOIN project_members pm ON pm.project_id = p.id
    WHERE k.id = ${keywordId} AND pm.user_id = ${userId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function manageableKeyword(userId: string, keywordId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT k.* FROM keywords k
    JOIN projects p ON p.id = k.project_id
    JOIN project_members pm ON pm.project_id = p.id
    WHERE k.id = ${keywordId}
      AND pm.user_id = ${userId}
      AND pm.role IN ('owner','editor')
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function ownedSignal(userId: string, signalId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT s.* FROM signals s
    JOIN projects p ON p.id = s.project_id
    JOIN project_members pm ON pm.project_id = p.id
    WHERE s.id = ${signalId} AND pm.user_id = ${userId}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}

export async function manageableSignal(userId: string, signalId: string) {
  if (!sql) throw new Error("DATABASE_URL is not configured");
  const rows = (await sql`
    SELECT s.* FROM signals s
    JOIN projects p ON p.id = s.project_id
    JOIN project_members pm ON pm.project_id = p.id
    WHERE s.id = ${signalId}
      AND pm.user_id = ${userId}
      AND pm.role IN ('owner','editor')
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ?? null;
}
