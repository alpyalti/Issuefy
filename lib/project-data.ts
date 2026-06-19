import { cache } from "react";
import { requireSql } from "./db";
import type { ProjectRole } from "./api";

/**
 * Cached project reads — React 19's cache() dedupes calls within a single
 * server render pass. Both /dashboard/[id]/layout.tsx and
 * /dashboard/[id]/page.tsx (and /settings, /sources) end up needing the same
 * project + watchlist rows; with cache() the SQL only fires once per request.
 *
 * Teams (migration 0009): getProject now joins through project_members so it
 * allows any role (owner/editor/viewer) and returns the caller's role on the
 * row as `current_user_role`. Existing callers can keep destructuring fields
 * and ignore the new one; Phase 5 will read it to gate UI.
 */

export const getProject = cache(async (projectId: string, userId: string) => {
  const sql = requireSql();
  const rows = (await sql`
    SELECT p.id, p.name, p.company_name, p.company_website, p.company_description,
           p.company_socials, p.track_company, p.industry, p.business_type, p.target_market,
           p.is_active, p.last_scraped_at, p.last_manual_refresh_at, p.created_at,
           pm.role AS current_user_role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE p.id = ${projectId} AND pm.user_id = ${userId}
     LIMIT 1
  `) as Array<{
    id: string; name: string; company_name: string | null; company_website: string | null;
    company_description: string | null; company_socials: Record<string, string> | null;
    track_company: boolean; industry: string; business_type: string; target_market: string;
    is_active: boolean;
    last_scraped_at: string | null; last_manual_refresh_at: string | null; created_at: string;
    current_user_role: ProjectRole;
  }>;
  return rows[0] ?? null;
});

export const getCompetitors = cache(async (projectId: string) => {
  const sql = requireSql();
  const rows = await sql`
    SELECT id, name, website_url, description, socials, is_active
    FROM competitors WHERE project_id = ${projectId} ORDER BY created_at ASC
  `;
  return rows as unknown as Array<{
    id: string; name: string; website_url: string;
    description: string | null; socials: Record<string, string> | null;
    is_active: boolean;
  }>;
});

export const getKeywords = cache(async (projectId: string) => {
  const sql = requireSql();
  const rows = await sql`
    SELECT id, keyword, is_active, last_discovered_at
    FROM keywords WHERE project_id = ${projectId} ORDER BY created_at ASC
  `;
  return rows as unknown as Array<{ id: string; keyword: string; is_active: boolean; last_discovered_at: string | null }>;
});

export const getSavedCount = cache(async (projectId: string) => {
  const sql = requireSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS n FROM signals
    WHERE project_id = ${projectId} AND is_saved = true AND dismissed_at IS NULL
  `) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
});

/** Count of unworked leads (status='new'). Drives the sidebar Leads badge.
 *  Tolerates the table being absent on pre-migration environments. */
export const getNewLeadsCount = cache(async (projectId: string) => {
  try {
    const sql = requireSql();
    const rows = (await sql`
      SELECT COUNT(*)::int AS n FROM keyword_leads
      WHERE project_id = ${projectId} AND status = 'new' AND lead_score >= 70
    `) as Array<{ n: number }>;
    return rows[0]?.n ?? 0;
  } catch {
    return 0;
  }
});

/** Count of signals created in the last 24h that aren't dismissed.
 *  Drives the notification bell badge in the topbar. */
export const getNewSignalCount = cache(async (projectId: string) => {
  const sql = requireSql();
  const rows = (await sql`
    SELECT COUNT(*)::int AS n FROM signals
    WHERE project_id = ${projectId}
      AND dismissed_at IS NULL
      AND created_at > now() - interval '24 hours'
  `) as Array<{ n: number }>;
  return rows[0]?.n ?? 0;
});

/**
 * All projects this user can access — used by the sidebar project switcher
 * and the multi-project hub at /dashboard. Includes both owned projects and
 * those the user is an editor / viewer on. Each row carries the caller's
 * role so the switcher can show an EDITOR / VIEWER chip when relevant.
 */
export const getAccessibleProjects = cache(async (userId: string) => {
  const sql = requireSql();
  const rows = await sql`
    SELECT p.id, p.name, p.company_name, pm.role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ${userId}
     ORDER BY p.created_at DESC
  `;
  return rows as unknown as Array<{
    id: string;
    name: string;
    company_name: string | null;
    role: ProjectRole;
  }>;
});

/**
 * Back-compat alias — existing call sites (DashChrome data flow, /dashboard
 * hub) used to call getOwnedProjects. Behaviour widened to "accessible" via
 * the join through project_members; the existing destructure of { id, name,
 * company_name } still works. New role field is appended.
 */
export const getOwnedProjects = getAccessibleProjects;
