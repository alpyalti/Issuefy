import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { requireActiveSubscription, getBillingContext } from "@/lib/billing-gate";
import { Icon } from "@/components/icons/Icon";
import { EmptyState, EMPTY_STATES } from "@/components/ui/EmptyState";
import GlobalShell from "@/components/dashboard/GlobalShell";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ upgraded?: string }>;

/**
 * /dashboard
 *
 * - 0 projects → onboarding empty state (PRD §19 NO_PROJECT)
 * - 1 project  → redirect straight in (most users land here)
 * - 2+ projects → list with last-scrape timestamps inside the GlobalShell
 *   chrome (same sidebar + topbar look as every project page).
 *
 * Server component: hits Neon directly via `sql` (auth + lazy upsert happens
 * here on the first authed action, fulfilling PRD §10.4).
 *
 * Trial gate: users without an active Stripe subscription get bounced to
 * /upgrade?required=1 (lib/billing-gate.ts). `?upgraded=1` (set by Stripe's
 * success_url) bypasses the gate once to absorb the webhook race.
 */
export default async function DashboardIndex({ searchParams }: { searchParams: SearchParams }) {
  // Lazy user upsert + Resend welcome email (first time only).
  const user = await getOrCreateUser();
  const sp = await searchParams;
  await requireActiveSubscription(user.id, { allowUpgradedHint: sp.upgraded === "1" });

  const sql = requireSql();
  // Membership-aware list (Teams Phase 2). Includes both owned projects and
  // those the user is an editor / viewer on, with the role on each row.
  const projects = (await sql`
    SELECT p.id, p.name, p.company_name, p.last_scraped_at, p.last_manual_refresh_at, p.created_at,
           pm.role
      FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ${user.id}
     ORDER BY p.created_at DESC
  `) as Array<{
    id: string; name: string; company_name: string | null;
    last_scraped_at: string | null; last_manual_refresh_at: string | null;
    created_at: string;
    role: "owner" | "editor" | "viewer";
  }>;

  if (projects.length === 0) {
    return (
      <div className="page-wrap">
        <header style={{ marginBottom: 36 }}>
          <h1 style={{ fontSize: 32, fontFamily: "var(--serif)" }}>Welcome to Issuefy</h1>
          <p className="muted" style={{ marginTop: 8 }}>Set up your first project to start receiving daily market briefs.</p>
        </header>
        <EmptyState {...EMPTY_STATES.NO_PROJECT} />
      </div>
    );
  }

  if (projects.length === 1) {
    redirect(`/dashboard/${projects[0].id}`);
  }

  const owned = projects.filter((p) => p.role === "owner");
  const shared = projects.filter((p) => p.role !== "owner");

  // ProfileMenu needs a projectId for its Account link. The account page is
  // user-scoped (the project ID is just structural), so any project the user
  // has works — we pass the first one (always exists because of the
  // length-1 redirect above).
  const fallbackProjectId = projects[0].id;
  const billing = await getBillingContext(user.id);
  const initials = (user.name || user.email).split(/\s+|@/)[0]?.[0]?.toUpperCase() || "U";

  // Same rider-derivation as dashboard/[projectId]/layout.tsx — pick the
  // highest-tier inviter so the "Manage subscription" alert points at the
  // most relevant owner when the user rides on multiple plans.
  const TIER_RANK: Record<string, number> = { starter: 1, growth: 2, agency: 3, enterprise: 4 };
  const primary = billing.isRiderOnly
    ? [...billing.memberships].sort((a, b) => (TIER_RANK[b.owner_plan] ?? 0) - (TIER_RANK[a.owner_plan] ?? 0))[0]
    : null;
  const rider = billing.isRiderOnly && primary
    ? { isRiderOnly: true, primaryOwnerName: primary.owner_name, primaryOwnerEmail: primary.owner_email }
    : undefined;

  function ProjectCard({ p }: { p: typeof projects[number] }) {
    return (
      <Link key={p.id} href={`/dashboard/${p.id}`} className="card" style={{ padding: 22, textDecoration: "none", display: "flex", flexDirection: "column", gap: 8, transition: "border-color .14s, box-shadow .2s, transform .14s" }}>
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", gap: 8 }}>
          <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, color: "var(--ink)" }}>{p.name}</h3>
          {p.role !== "owner" && (
            <span className={"proj-role-chip role-" + p.role}>{p.role.toUpperCase()}</span>
          )}
        </div>
        {p.company_name && <span className="muted" style={{ fontSize: 13 }}>{p.company_name}</span>}
        <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-4)", letterSpacing: ".04em", marginTop: "auto" }}>
          {p.last_scraped_at ? `Updated ${new Date(p.last_scraped_at).toLocaleDateString()}` : "Awaiting first scrape"}
        </span>
      </Link>
    );
  }

  return (
    <GlobalShell
      user={{ name: user.name, email: user.email, initials }}
      fallbackProjectId={fallbackProjectId}
      rider={rider}
      title="Your projects"
      subtitle="Pick a project to open its dashboard"
      topbarAction={
        <Link href="/dashboard/new" className="btn btn-accent">
          <Icon name="Add01Icon" size={16} stroke={2} /> New project
        </Link>
      }
    >
      <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
        {owned.length > 0 && (
          <section>
            {shared.length > 0 && (
              <h2 style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 14 }}>
                Owned by you
              </h2>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {owned.map((p) => <ProjectCard key={p.id} p={p} />)}
            </div>
          </section>
        )}

        {shared.length > 0 && (
          <section>
            <h2 style={{ fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 14 }}>
              Shared with you
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {shared.map((p) => <ProjectCard key={p.id} p={p} />)}
            </div>
          </section>
        )}
      </div>
    </GlobalShell>
  );
}
