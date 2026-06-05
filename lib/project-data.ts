import { cache } from "react";
import { requireSql } from "./db";

/**
 * Cached project reads — React 19's cache() dedupes calls within a single
 * server render pass. Both /dashboard/[id]/layout.tsx and
 * /dashboard/[id]/page.tsx (and /settings, /sources) end up needing the same
 * project + watchlist rows; with cache() the SQL only fires once per request.
 */

export const getProject = cache(async (projectId: string, userId: string) => {
  const sql = requireSql();
  const rows = (await sql`
    SELECT id, name, company_name, company_website, company_description,
           company_socials, track_company, industry, business_type, target_market,
           is_active, last_scraped_at, last_manual_refresh_at, created_at
    FROM projects WHERE id = ${projectId} AND user_id = ${userId} LIMIT 1
  `) as Array<{
    id: string; name: string; company_name: string | null; company_website: string | null;
    company_description: string | null; company_socials: Record<string, string> | null;
    track_company: boolean; industry: string; business_type: string; target_market: string;
    is_active: boolean;
    last_scraped_at: string | null; last_manual_refresh_at: string | null; created_at: string;
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

/** All projects this user owns — used by the sidebar project switcher. */
export const getOwnedProjects = cache(async (userId: string) => {
  const sql = requireSql();
  const rows = await sql`
    SELECT id, name, company_name FROM projects
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return rows as unknown as Array<{ id: string; name: string; company_name: string | null }>;
});
