import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getAccessibleProjects } from "@/lib/project-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /support — stable top-level entry point used by transactional emails and
 * the Help link in the profile menu. The real page lives inside the dashboard
 * shell at /dashboard/{projectId}/support; we redirect using the user's
 * primary accessible project so they always land somewhere sensible.
 */
export default async function SupportRedirect() {
  const user = await getOrCreateUser();
  const projects = await getAccessibleProjects(user.id);
  if (projects.length === 0) redirect("/dashboard");
  redirect(`/dashboard/${projects[0].id}/support`);
}
