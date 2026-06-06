import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, notFound, parseJson } from "@/lib/api";
import { captureError } from "@/lib/sentry";
import { adminTicket } from "@/lib/support";
import { sendSupportAdminReplyEmail } from "@/lib/mailer";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  body: z.string().trim().min(1).max(10_000),
  /** When true, the ticket transitions to 'resolved' after the reply. */
  resolve: z.boolean().optional(),
}).strict();

/**
 * POST /api/admin/support/tickets/:id/messages — admin replies to a ticket.
 *
 * After insertion the ticket flips to 'pending' (awaiting user response)
 * unless `resolve: true` is sent, in which case it goes to 'resolved'. The
 * user is emailed best-effort so they know to come back to the thread.
 */
export async function POST(req: Request, { params }: Ctx) {
  const admin = await requireAdminApi();
  if (admin instanceof Response) return admin;
  const { id: ticketId } = await params;
  const ticket = await adminTicket(ticketId);
  if (!ticket) return notFound();

  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const nextStatus = body.resolve ? "resolved" : "pending";
  try {
    await sql`
      INSERT INTO support_messages (ticket_id, author_id, author_type, body)
      VALUES (${ticketId}, ${admin.id}, 'admin', ${body.body.trim()})
    `;
    await sql`
      UPDATE support_tickets
         SET status          = ${nextStatus},
             last_message_at = now(),
             last_message_by = 'admin',
             updated_at      = now()
       WHERE id = ${ticketId}
    `;
  } catch (e) {
    captureError(e, { route: "POST /api/admin/support/tickets/:id/messages", ticketId });
    return json({ error: "Couldn't post the reply." }, { status: 500 });
  }

  // Email the user that we replied. Best-effort.
  try {
    const userRows = (await sql`
      SELECT email, name FROM users WHERE id = ${ticket.user_id} LIMIT 1
    `) as Array<{ email: string; name: string | null }>;
    const u = userRows[0];
    if (u) {
      await sendSupportAdminReplyEmail(u.email, {
        userName: u.name,
        subject: ticket.subject,
        body: body.body.trim(),
        ticketId,
        resolved: !!body.resolve,
      });
    }
  } catch (e) {
    captureError(e, { stage: "support.adminReply.email", ticketId });
  }

  return json({ ok: true, status: nextStatus });
}
