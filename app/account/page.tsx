import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getOwnedProjects } from "@/lib/project-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The account UI now renders inside the dashboard shell at
 * /dashboard/[projectId]/account. This top-level route stays as a stable entry
 * point — transactional emails (lib/mailer.ts) and the Stripe Customer Portal
 * return_url both point at /account — and redirects into the shelled page using
 * the user's most-recent project (or onboarding if they have none yet).
 */
export default async function AccountRedirect() {
  const user = await getOrCreateUser();
  const projects = await getOwnedProjects(user.id);
  if (projects.length === 0) redirect("/dashboard");
  redirect(`/dashboard/${projects[0].id}/account`);
}
