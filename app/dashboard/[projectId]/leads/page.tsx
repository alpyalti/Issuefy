import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getProject } from "@/lib/project-data";
import LeadsInbox from "@/components/leads/LeadsInbox";
import type { Lead } from "@/components/leads/LeadCard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Leads — Issuefy" };

type Ctx = { params: Promise<{ projectId: string }> };

/**
 * Central Leads inbox — every potential customer found across all of the
 * project's keywords, filterable. Same access control as every project page.
 */
export default async function LeadsPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  const project = await getProject(projectId, user.id);
  if (!project) notFound();

  const leads = (await sql`
    SELECT kl.id, kl.keyword_id, k.keyword, kl.platform, kl.post_url, kl.post_title, kl.post_excerpt,
           kl.author, kl.author_url, kl.context, kl.posted_at::text AS posted_at, kl.engagement,
           kl.lead_score, kl.intent, kl.reason, kl.draft_reply, kl.status
    FROM keyword_leads kl
    JOIN keywords k ON k.id = kl.keyword_id
    WHERE kl.project_id = ${projectId}
    ORDER BY kl.lead_score DESC, kl.created_at DESC
    LIMIT 200
  `) as unknown as Lead[];

  return <LeadsInbox projectId={projectId} leads={leads} />;
}
