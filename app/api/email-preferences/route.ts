import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, parseJson } from "@/lib/api";

export const runtime = "nodejs";

const updateSchema = z.object({
  email_brief_enabled: z.boolean(),
}).strict();

/** GET /api/email-preferences — read current state. */
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  return json({
    email_brief_enabled: user.email_brief_enabled,
  });
}

/** PATCH /api/email-preferences — toggle the daily brief on/off. */
export async function PATCH(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseJson(req, updateSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const rows = await sql`
    UPDATE users
    SET email_brief_enabled = ${body.email_brief_enabled}, updated_at = now()
    WHERE id = ${user.id}
    RETURNING email_brief_enabled
  `;
  return json({ email_brief_enabled: rows[0]?.email_brief_enabled ?? body.email_brief_enabled });
}
