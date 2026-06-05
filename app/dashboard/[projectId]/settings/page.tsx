import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getLimits, currentPeriodStart, HARD_CAPS } from "@/lib/usage";
import { getUsage } from "@/lib/usage-counters";
import { UsageMeter } from "@/components/ui/UsageMeter";
import SettingsClient from "@/components/settings/SettingsClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export default async function SettingsPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  const projectRows = (await sql`
    SELECT id, name, company_name, company_website, company_description,
           company_socials, track_company, industry, business_type, target_market
    FROM projects WHERE id = ${projectId} AND user_id = ${user.id} LIMIT 1
  `) as {
    id: string; name: string; company_name: string | null; company_website: string | null;
    company_description: string | null; company_socials: Record<string, string> | null;
    track_company: boolean; industry: string; business_type: string; target_market: string;
  }[];
  if (!projectRows[0]) notFound();
  const project = projectRows[0];

  const [competitors, keywords, usage] = await Promise.all([
    sql`SELECT id, name, website_url, description, is_active FROM competitors WHERE project_id = ${projectId} ORDER BY created_at ASC`,
    sql`SELECT id, keyword, is_active, last_discovered_at FROM keywords WHERE project_id = ${projectId} ORDER BY created_at ASC`,
    getUsage(user.id, currentPeriodStart()),
  ]);

  const limits = getLimits(user.plan);
  const usageRows = [
    { label: "Sources stored", used: usage.sources_stored, limit: limits.sourcesPerMonth, note: "Resets at the start of each calendar month." },
    { label: "AI signals generated", used: usage.signals_generated, limit: limits.signalsPerMonth },
    { label: "SERP discovery calls", used: usage.serp_calls, limit: limits.serpCallsPerCycle, note: "Weekly discovery — keyword → top organic results." },
    { label: "Scrape calls", used: usage.scrape_calls, limit: limits.scrapeCallsPerCycle, note: "Daily competitor + discovered URL scraping." },
  ];

  const competitorCap = Math.min(limits.competitorsPerProject, HARD_CAPS.competitorsPerProject);
  const keywordCap = Math.min(limits.keywordsPerProject, HARD_CAPS.keywordsPerProject);

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
        }}
        competitors={competitors as { id: string; name: string; website_url: string; description: string | null; is_active: boolean }[]}
        keywords={keywords as { id: string; keyword: string; is_active: boolean; last_discovered_at: string | null }[]}
        competitorCap={competitorCap}
        keywordCap={keywordCap}
      />
    </div>
  );
}
