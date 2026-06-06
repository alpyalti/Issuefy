import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { conflict, json, notFound, parseJson } from "@/lib/api";
import { captureError } from "@/lib/sentry";
import { ownedTicket } from "@/lib/support";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  body: z.string().trim().min(1).max(10_000),
}).strict();

/**
 * POST /api/support/tickets/:id/messages — user adds a reply to their ticket.
 *
 * Reopens a resolved ticket back to 'open' so admins know to look again.
 * Closed tickets are sealed — the UI hides the reply form, but a stray request
 * is rejected with 409.
 */
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: ticketId } = await params;
  const ticket = await ownedTicket(user.id, ticketId);
  if (!ticket) return notFound();
  if (ticket.status === "closed") return conflict("This ticket is closed. Open a new one for follow-up questions.");

  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  try {
    await sql`
      INSERT INTO support_messages (ticket_id, author_id, author_type, body)
      VALUES (${ticketId}, ${user.id}, 'user', ${body.body.trim()})
    `;
    // User reply → back to 'open' so admins know to revisit, and bump the
    // sort fields.
    await sql`
      UPDATE support_tickets
         SET status          = CASE WHEN status = 'resolved' THEN 'open' ELSE status END,
             last_message_at = now(),
             last_message_by = 'user',
             updated_at      = now()
       WHERE id = ${ticketId}
    `;
  } catch (e) {
    captureError(e, { route: "POST /api/support/tickets/:id/messages", ticketId });
    return json({ error: "Couldn't post your reply." }, { status: 500 });
  }
  return json({ ok: true });
}
