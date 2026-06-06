import { z } from "zod";
import { requireAdminApi } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json, notFound, parseJson } from "@/lib/api";
import { adminTicket, getTicketMessages } from "@/lib/support";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["open", "pending", "resolved", "closed"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
}).strict().refine(
  (b) => b.status !== undefined || b.priority !== undefined,
  { message: "Must change at least one field" },
);

/**
 * GET /api/admin/support/tickets/:id — full ticket + thread, plus the
 * requester's user row for the admin to see who they're talking to.
 */
export async function GET(_req: Request, { params }: Ctx) {
  const admin = await requireAdminApi();
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const ticket = await adminTicket(id);
  if (!ticket) return notFound();
  const sql = requireSql();
  const userRows = (await sql`
    SELECT id, email, name, plan, subscription_status, created_at
      FROM users WHERE id = ${ticket.user_id} LIMIT 1
  `) as Array<{ id: string; email: string; name: string | null; plan: string; subscription_status: string | null; created_at: string }>;
  const messages = await getTicketMessages(id);
  return json({ ticket, user: userRows[0] ?? null, messages });
}

/**
 * PATCH /api/admin/support/tickets/:id — admin changes status / priority.
 * Doesn't touch the thread (replies go through POST messages).
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const admin = await requireAdminApi();
  if (admin instanceof Response) return admin;
  const { id } = await params;
  const ticket = await adminTicket(id);
  if (!ticket) return notFound();
  const body = await parseJson(req, patchSchema);
  if (body instanceof Response) return body;
  const sql = requireSql();
  await sql`
    UPDATE support_tickets SET
      status     = COALESCE(${body.status ?? null},   status),
      priority   = COALESCE(${body.priority ?? null}, priority),
      updated_at = now()
    WHERE id = ${id}
  `;
  return json({ ok: true });
}
