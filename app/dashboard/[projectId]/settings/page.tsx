import { notFound } from "next/navigation";
import { getOrCreateUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { getProject, getCompetitors, getKeywords } from "@/lib/project-data";
import { getLimits, currentPeriodStart, HARD_CAPS } from "@/lib/usage";
import { getUsage } from "@/lib/usage-counters";
import { UsageMeter } from "@/components/ui/UsageMeter";
import SettingsClient from "@/components/settings/SettingsClient";
import TeamCard from "@/components/settings/TeamCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export default async function SettingsPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();

  // All four reads come from cache() — layout + settings page issue each
  // underlying SQL only once per request.
  const [project, competitors, keywords, usage] = await Promise.all([
    getProject(projectId, user.id),
    getCompetitors(projectId),
    getKeywords(projectId),
    getUsage(user.id, currentPeriodStart()),
  ]);
  if (!project) notFound();

  const limits = getLimits(user.plan);
  const usageRows = [
    { label: "Sources collected", used: usage.sources_stored, limit: limits.sourcesPerMonth, note: "Articles, posts and pages we've gathered for you this month." },
    { label: "Insights generated", used: usage.signals_generated, limit: limits.signalsPerMonth, note: "Key findings our AI summarized from those sources." },
    { label: "Keyword searches", used: usage.serp_calls, limit: limits.serpCallsPerCycle, note: "Web searches we run on your keywords to find new sources." },
    { label: "Page checks", used: usage.scrape_calls, limit: limits.scrapeCallsPerCycle, note: "Times we visit your competitors and links to check for updates." },
  ];

  const competitorCap = Math.min(limits.competitorsPerProject, HARD_CAPS.competitorsPerProject);
  const keywordCap = Math.min(limits.keywordsPerProject, HARD_CAPS.keywordsPerProject);

  // Owner-only Team card. Seat count is per-account (distinct members across
  // all projects this user owns + pending invitations) — mirrors the cap
  // check enforced server-side on POST /invitations.
  const isOwner = project.current_user_role === "owner";
  let seatsUsed = 0;
  if (isOwner) {
    const sql = requireSql();
    const seatRows = (await sql`
      SELECT
        (SELECT COUNT(DISTINCT pm.user_id)::int
           FROM project_members pm
           JOIN projects p ON p.id = pm.project_id
          WHERE p.user_id = ${user.id})
        AS members,
        (SELECT COUNT(*)::int
           FROM project_invitations pi
           JOIN projects p ON p.id = pi.project_id
          WHERE p.user_id = ${user.id}
            AND pi.accepted_at IS NULL
            AND pi.canceled_at IS NULL
            AND pi.expires_at > now())
        AS pending
    `) as Array<{ members: number; pending: number }>;
    seatsUsed = (seatRows[0]?.members ?? 0) + (seatRows[0]?.pending ?? 0);
  }

  return (
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <UsageMeter rows={usageRows} />

      <SettingsClient
        project={{
          id: project.id,
          name: project.name,
          company_name: project.company_name,
          company_website: project.company_website,
          company_description: project.company_description,
          company_socials: project.company_socials,
          track_company: project.track_company,
          industry: project.industry,
          business_type: project.business_type,
          target_market: project.target_market,
          is_active: project.is_active ?? true,
        }}
        competitors={competitors}
        keywords={keywords}
        competitorCap={competitorCap}
        keywordCap={keywordCap}
      />

      {isOwner && (
        <TeamCard
          projectId={project.id}
          currentUserId={user.id}
          seatsUsedInitial={seatsUsed}
          seatsLimit={limits.seats}
        />
      )}
    </div>
  );
}
