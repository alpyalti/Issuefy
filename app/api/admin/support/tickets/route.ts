import { requireAdminApi } from "@/lib/admin";
import { requireSql } from "@/lib/db";
import { json } from "@/lib/api";

export const runtime = "nodejs";

/**
 * GET /api/admin/support/tickets — list ALL tickets with filters.
 *
 * Filters via query string:
 *   ?status=open|pending|resolved|closed   (default: omit closed)
 *   ?priority=low|normal|high|urgent       (omit = any)
 *   ?q=<substring>                          subject ILIKE
 *
 * Each row includes the requester's email + name + plan for fast triage,
 * plus message_count and the latest message snippet (first 200 chars).
 */
export async function GET(req: Request) {
  const admin = await requireAdminApi();
  if (admin instanceof Response) return admin;
  const sql = requireSql();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const rows = await sql`
    SELECT t.id,
           t.subject,
           t.category,
           t.priority,
           t.status,
           t.last_message_at,
           t.last_message_by,
           t.created_at,
           u.email      AS user_email,
           u.name       AS user_name,
           u.plan       AS user_plan,
           (SELECT COUNT(*)::int FROM support_messages WHERE ticket_id = t.id) AS message_count,
           (SELECT substring(body FROM 1 FOR 200)
              FROM support_messages
             WHERE ticket_id = t.id
             ORDER BY created_at DESC
             LIMIT 1)
           AS last_message_snippet
      FROM support_tickets t
      JOIN users u ON u.id = t.user_id
     WHERE (${status}::text IS NULL OR t.status = ${status}::text)
       AND (${priority}::text IS NULL OR t.priority = ${priority}::text)
       AND (${q}::text = '' OR LOWER(t.subject) LIKE '%' || ${q}::text || '%')
       -- Default: hide 'closed' from the queue unless explicitly requested.
       AND (${status}::text IS NOT NULL OR t.status <> 'closed')
     ORDER BY
       -- Pin urgent + high to the top regardless of activity, then by activity.
       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       CASE t.status WHEN 'open' THEN 0 WHEN 'pending' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
       t.last_message_at DESC
     LIMIT 200
  `;

  // Aggregate counts for the queue chips.
  const summaryRows = (await sql`
    SELECT status, COUNT(*)::int AS n FROM support_tickets GROUP BY status
  `) as Array<{ status: string; n: number }>;

  return json({ tickets: rows, summary: summaryRows });
}
