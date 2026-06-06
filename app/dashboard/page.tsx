import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { requireActiveSubscription } from "@/lib/billing-gate";
import { Icon } from "@/components/icons/Icon";
import { EmptyState, EMPTY_STATES } from "@/components/ui/EmptyState";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ upgraded?: string }>;

/**
 * /dashboard
 *
 * - 0 projects → onboarding empty state (PRD §19 NO_PROJECT)
 * - 1 project  → redirect straight in (most users land here)
 * - 2+ projects → list with last-scrape timestamps
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
    <div className="page-wrap" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 28, fontFamily: "var(--serif)" }}>Your projects</h1>
          <p className="muted" style={{ marginTop: 6 }}>Pick a project to open its dashboard.</p>
        </div>
        <Link href="/dashboard/new" className="btn btn-accent">
          <Icon name="Add01Icon" size={16} stroke={2} /> New project
        </Link>
      </header>

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
  );
}
