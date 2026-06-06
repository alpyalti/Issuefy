import { requireUser } from "@/lib/clerk-user";
import { json, notFound } from "@/lib/api";
import { getTicketMessages, ownedTicket } from "@/lib/support";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/support/tickets/:id — fetch MY ticket + full thread. Returns 404
 * (not 403) on other people's tickets to avoid leaking existence.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const ticket = await ownedTicket(user.id, id);
  if (!ticket) return notFound();
  const messages = await getTicketMessages(id);
  return json({ ticket, messages });
}
