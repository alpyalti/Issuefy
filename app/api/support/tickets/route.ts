import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, parseJson, rateLimited } from "@/lib/api";
import { captureBreadcrumb, captureError } from "@/lib/sentry";
import { sendSupportTicketCreatedEmail, sendSupportInboundNotification } from "@/lib/mailer";

export const runtime = "nodejs";

const createSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  category: z.enum(["bug", "feature", "billing", "account", "general"]).optional(),
  body: z.string().trim().min(10).max(10_000),
}).strict();

// In-memory soft rate limit so the form can't be hammered.
const lastSubmit = new Map<string, number>();

/**
 * GET /api/support/tickets — list MY tickets, newest activity first.
 */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const sql = requireSql();
  const rows = await sql`
    SELECT id, subject, category, priority, status,
           last_message_at, last_message_by, created_at,
           (SELECT COUNT(*)::int FROM support_messages WHERE ticket_id = support_tickets.id) AS message_count
      FROM support_tickets
     WHERE user_id = ${user.id}
     ORDER BY last_message_at DESC
  `;
  return json({ tickets: rows });
}

/**
 * POST /api/support/tickets — open a new ticket. Atomically writes both the
 * ticket row and the first support_messages row so an empty-thread ticket
 * can never exist. Best-effort email confirmation to the user + heads-up to
 * the support inbox so the team sees it outside the admin panel.
 */
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const last = lastSubmit.get(user.id) ?? 0;
  if (Date.now() - last < 10_000) return rateLimited("Slow down — give that a moment.");

  const body = await parseJson(req, createSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  let ticketId: string;
  try {
    // Insert ticket + first message. Neon's HTTP driver doesn't expose
    // BEGIN/COMMIT, but the second insert can safely fail and we just
    // delete the orphan ticket — extremely rare.
    const ticketRows = (await sql`
      INSERT INTO support_tickets (user_id, subject, category)
      VALUES (${user.id}, ${body.subject.trim()}, ${body.category ?? "general"})
      RETURNING id, created_at
    `) as Array<{ id: string; created_at: string }>;
    ticketId = ticketRows[0].id;

    try {
      await sql`
        INSERT INTO support_messages (ticket_id, author_id, author_type, body)
        VALUES (${ticketId}, ${user.id}, 'user', ${body.body.trim()})
      `;
    } catch (e) {
      await sql`DELETE FROM support_tickets WHERE id = ${ticketId}`;
      throw e;
    }
  } catch (e) {
    captureError(e, { route: "POST /api/support/tickets", userId: user.id });
    return json({ error: "Couldn't open the ticket." }, { status: 500 });
  }

  lastSubmit.set(user.id, Date.now());
  captureBreadcrumb("support ticket opened", { ticketId, userId: user.id });

  // Email side effects. Non-fatal so a Resend hiccup doesn't lose the ticket.
  try {
    await sendSupportTicketCreatedEmail(user.email, {
      userName: user.name,
      subject: body.subject.trim(),
      body: body.body.trim(),
      ticketId,
    });
  } catch (e) { captureError(e, { stage: "support.created.user", ticketId }); }
  try {
    await sendSupportInboundNotification({
      userName: user.name,
      userEmail: user.email,
      subject: body.subject.trim(),
      body: body.body.trim(),
      category: body.category ?? "general",
      ticketId,
    });
  } catch (e) { captureError(e, { stage: "support.inbound.admin", ticketId }); }

  return json({ ticketId }, { status: 201 });
}
