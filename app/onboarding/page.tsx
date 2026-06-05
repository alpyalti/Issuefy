import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";
import "../dashboard.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /onboarding — first-run setup flow (PRD §17.2).
 *
 * Six steps, website-first:
 *   1. Welcome
 *   2. Your company (optional) — paste website
 *   3. Confirm company — editable enriched profile + business details
 *   4. Add competitors — paste website → confirm enriched profile
 *   5. Keywords — chip input, min 3
 *   6. Finish — POST everything to the API, redirect to /dashboard/[id]
 *
 * If the user already has a project, jump straight to the dashboard so
 * accidental visits don't re-onboard.
 */
export default async function OnboardingPage() {
  const user = await getOrCreateUser();
  const sql = requireSql();

  const existing = (await sql`
    SELECT id FROM projects WHERE user_id = ${user.id} ORDER BY created_at ASC LIMIT 1
  `) as { id: string }[];
  if (existing[0]) redirect(`/dashboard/${existing[0].id}`);

  const firstName = (user.name || "").split(" ")[0];

  return <OnboardingFlow userName={firstName} />;
}
