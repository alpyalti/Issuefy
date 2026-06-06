import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getAccessibleProjects } from "@/lib/project-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Redirect — preserves the ticket id so email links like
 * https://issuefy.app/support/tickets/{id} continue to land on the thread.
 */
export default async function TicketDetailRedirect({ params }: Ctx) {
  const { id } = await params;
  const user = await getOrCreateUser();
  const projects = await getAccessibleProjects(user.id);
  if (projects.length === 0) redirect("/dashboard");
  redirect(`/dashboard/${projects[0].id}/support/tickets/${id}`);
}
