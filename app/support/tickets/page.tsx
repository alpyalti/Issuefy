import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getAccessibleProjects } from "@/lib/project-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Redirect — see /app/support/page.tsx for the rationale. */
export default async function TicketsListRedirect() {
  const user = await getOrCreateUser();
  const projects = await getAccessibleProjects(user.id);
  if (projects.length === 0) redirect("/dashboard");
  redirect(`/dashboard/${projects[0].id}/support/tickets`);
}
