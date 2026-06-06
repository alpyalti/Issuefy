import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getLimits } from "@/lib/usage";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import "../../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "New project — Issuefy" };

/**
 * /dashboard/new — create an additional project (Teams Phase 2).
 *
 * The original /onboarding route short-circuits when the user already has a
 * project (it sends them to that project's dashboard). That made multi-project
 * creation impossible from the UI. This route is the explicit entry point:
 * it checks the user's plan cap, redirects to /upgrade if they're at it, and
 * otherwise reuses the existing onboarding wizard in mode="new-project" so
 * the post-submit flow skips Stripe Checkout (the user already pays) and
 * routes directly into the new project's dashboard.
 */
export default async function NewProjectPage() {
  const user = await getOrCreateUser();
  const sql = requireSql();
  const limits = getLimits(user.plan);

  const countRows = (await sql`
    SELECT COUNT(*)::int AS n FROM projects WHERE user_id = ${user.id}
  `) as Array<{ n: number }>;
  const owned = countRows[0]?.n ?? 0;

  if (owned >= limits.projects) {
    redirect("/upgrade?required=1&reason=project_cap");
  }

  const firstName = (user.name || "").split(" ")[0];
  return <OnboardingFlow userName={firstName} mode="new-project" />;
}
