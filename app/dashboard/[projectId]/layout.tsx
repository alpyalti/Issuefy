import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import DashChrome from "@/components/dashboard/DashChrome";
import "../../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * Project-scoped layout: renders the persistent sidebar + topbar + ⌘K palette
 * for every /dashboard/[projectId]/** page. Each child page then renders its
 * own content inside the main scroll area.
 *
 * Fetches the data the chrome needs (project, user, watchlist) ONCE per nav.
 */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Ctx["params"] }) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  const projRows = (await sql`
    SELECT id, name FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `) as { id: string; name: string }[];
  if (!projRows[0]) notFound();
  const project = projRows[0];

  const [competitorRowsRaw, keywordRowsRaw, savedCountRaw] = await Promise.all([
    sql`SELECT id, name, is_active FROM competitors WHERE project_id = ${projectId} ORDER BY created_at ASC`,
    sql`SELECT id, keyword, is_active FROM keywords WHERE project_id = ${projectId} ORDER BY created_at ASC`,
    sql`SELECT COUNT(*)::int AS n FROM signals WHERE project_id = ${projectId} AND is_saved = true AND dismissed_at IS NULL`,
  ]);
  const competitors = competitorRowsRaw as unknown as { id: string; name: string; is_active: boolean }[];
  const keywords = keywordRowsRaw as unknown as { id: string; keyword: string; is_active: boolean }[];
  const savedCount = (savedCountRaw as unknown as { n: number }[])[0]?.n ?? 0;

  const initials =
    ((user.name || user.email).split(/\s|@/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "U").toUpperCase();

  return (
    <DashChrome
      project={project}
      user={{ name: user.name, email: user.email, initials }}
      competitors={competitors}
      keywords={keywords}
      savedCount={savedCount}
    >
      {children}
    </DashChrome>
  );
}
