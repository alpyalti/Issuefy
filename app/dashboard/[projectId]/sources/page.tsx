import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getProject } from "@/lib/project-data";
import { EmptyState } from "@/components/ui/EmptyState";
import SourcesView, { type SourceRow } from "@/components/sources/SourcesView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export default async function SourcesPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  const project = await getProject(projectId, user.id);
  if (!project) notFound();

  // 200 most recent sources is plenty for the MVP — typically ~30 with a
  // small watchlist, well under the per-project/day safety rail (50/day).
  const sources = (await sql`
    SELECT id, title, url, domain, source_type, scraped_at, content_snippet
    FROM sources WHERE project_id = ${projectId}
    ORDER BY scraped_at DESC LIMIT 200
  `) as unknown as SourceRow[];

  if (sources.length === 0) {
    return (
      <div className="page-wrap">
        <EmptyState
          icon="News01Icon"
          message="No sources yet. The first scrape lands tomorrow morning, or run a manual refresh from the dashboard."
        />
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <SourcesView sources={sources} />
    </div>
  );
}
