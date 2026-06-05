import { redirect } from "next/navigation";
import Link from "next/link";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { Icon } from "@/components/icons/Icon";
import { EmptyState, EMPTY_STATES } from "@/components/ui/EmptyState";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /dashboard
 *
 * - 0 projects → onboarding empty state (PRD §19 NO_PROJECT)
 * - 1 project  → redirect straight in (most users land here)
 * - 2+ projects → list with last-scrape timestamps
 *
 * Server component: hits Neon directly via `sql` (auth + lazy upsert happens
 * here on the first authed action, fulfilling PRD §10.4).
 */
export default async function DashboardIndex() {
  // Lazy user upsert + Resend welcome email (first time only).
  const user = await getOrCreateUser();

  const sql = requireSql();
  const projects = (await sql`
    SELECT id, name, company_name, last_scraped_at, last_manual_refresh_at, created_at
    FROM projects
    WHERE user_id = ${user.id}
    ORDER BY created_at DESC
  `) as { id: string; name: string; company_name: string | null; last_scraped_at: string | null; last_manual_refresh_at: string | null; created_at: string }[];

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

  return (
    <div className="page-wrap">
      <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 30 }}>
        <div>
          <h1 style={{ fontSize: 28, fontFamily: "var(--serif)" }}>Your projects</h1>
          <p className="muted" style={{ marginTop: 6 }}>Pick a project to open its dashboard.</p>
        </div>
        <Link href="/onboarding" className="btn btn-accent">
          <Icon name="PlusSignIcon" size={16} stroke={2} /> New project
        </Link>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {projects.map((p) => (
          <Link key={p.id} href={`/dashboard/${p.id}`} className="card" style={{ padding: 22, textDecoration: "none", display: "flex", flexDirection: "column", gap: 8, transition: "border-color .14s, box-shadow .2s, transform .14s" }}>
            <h3 style={{ fontFamily: "var(--serif)", fontSize: 20, color: "var(--ink)" }}>{p.name}</h3>
            {p.company_name && <span className="muted" style={{ fontSize: 13 }}>{p.company_name}</span>}
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-4)", letterSpacing: ".04em", marginTop: "auto" }}>
              {p.last_scraped_at ? `Updated ${new Date(p.last_scraped_at).toLocaleDateString()}` : "Awaiting first scrape"}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
