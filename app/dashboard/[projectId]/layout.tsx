import { notFound } from "next/navigation";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getBillingContext, requireActiveSubscription } from "@/lib/billing-gate";
import {
  getProject, getCompetitors, getKeywords, getSavedCount,
  getNewSignalCount, getOwnedProjects,
} from "@/lib/project-data";
import DashChrome from "@/components/dashboard/DashChrome";
import "../../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }>; searchParams?: Promise<{ upgraded?: string }> };

/**
 * Project-scoped layout: persistent sidebar + topbar + ⌘K palette for every
 * /dashboard/[projectId]/** page.
 *
 * All DB reads go through React's cache() — the same project/watchlist
 * queries the page makes are de-duped, so the layout + page together only
 * issue each query once per request.
 *
 * Trial gate: blocks any /dashboard/[projectId]/* page when the user has no
 * active Stripe subscription, sending them to /upgrade?required=1 instead.
 * `?upgraded=1` (Stripe success_url hint) bypasses once.
 */
export default async function ProjectLayout({ children, params, searchParams }: { children: React.ReactNode; params: Ctx["params"]; searchParams?: Ctx["searchParams"] }) {
  const { projectId } = await params;
  const sp = searchParams ? await searchParams : {};
  const user = await getOrCreateUser();
  await requireActiveSubscription(user.id, { allowUpgradedHint: sp.upgraded === "1" });

  const [project, competitors, keywords, savedCount, newSignalCount, ownedProjects, billing] = await Promise.all([
    getProject(projectId, user.id),
    getCompetitors(projectId),
    getKeywords(projectId),
    getSavedCount(projectId),
    getNewSignalCount(projectId),
    getOwnedProjects(user.id),
    getBillingContext(user.id),
  ]);
  if (!project) notFound();

  const initials =
    ((user.name || user.email).split(/\s|@/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || "U").toUpperCase();

  // Rider-billing info for the profile menu's "Manage subscription" action.
  // Picks the highest-tier inviter (Starter < Growth < Agency < Enterprise)
  // as the primary contact when the user is on multiple owners' plans.
  const TIER_RANK: Record<string, number> = { starter: 1, growth: 2, agency: 3, enterprise: 4 };
  const primary = billing.isRiderOnly
    ? [...billing.memberships].sort((a, b) => (TIER_RANK[b.owner_plan] ?? 0) - (TIER_RANK[a.owner_plan] ?? 0))[0]
    : null;
  const rider = billing.isRiderOnly && primary
    ? { isRiderOnly: true, primaryOwnerName: primary.owner_name, primaryOwnerEmail: primary.owner_email }
    : undefined;

  return (
    <DashChrome
      project={{ id: project.id, name: project.name }}
      user={{ name: user.name, email: user.email, initials }}
      competitors={competitors.map((c) => ({ id: c.id, name: c.name, is_active: c.is_active }))}
      keywords={keywords.map((k) => ({ id: k.id, keyword: k.keyword, is_active: k.is_active }))}
      savedCount={savedCount}
      newSignalCount={newSignalCount}
      ownedProjects={ownedProjects}
      role={project.current_user_role}
      rider={rider}
    >
      {children}
    </DashChrome>
  );
}
