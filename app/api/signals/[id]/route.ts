import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, notFound, ownedSignal, parseJson } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * PATCH /api/signals/:id — persist the bookmarked-extras UX:
 *   { is_saved: boolean }     — toggle bookmark
 *   { dismissed: boolean }    — true = stamp dismissed_at, false = clear
 *
 * These columns are the additive ones we added beyond PRD §14 to back the
 * prototype's "Saved" sidebar entry and per-card dismiss button.
 * Ownership joins through signals → projects.user_id.
 */
const patchSchema = z.object({
  is_saved: z.boolean().optional(),
  dismissed: z.boolean().optional(),
  user_note: z.string().max(2_000).nullable().optional(),
  action_done: z.boolean().optional(),
}).strict().refine(
  (b) => b.is_saved !== undefined || b.dismissed !== undefined || b.user_note !== undefined || b.action_done !== undefined,
  { message: "Must set at least one field" },
);

export async function PATCH(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id } = await params;
  const owned = await ownedSignal(user.id, id);
  if (!owned) return notFound();

  const body = await parseJson(req, patchSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  // user_note: an empty string clears the note; null leaves it untouched.
  const noteProvided = body.user_note !== undefined;
  const noteValue = noteProvided ? (body.user_note?.trim() || null) : null;
  const actionProvided = body.action_done !== undefined;

  const rows = await sql`
    UPDATE signals SET
      is_saved     = COALESCE(${body.is_saved ?? null}, is_saved),
      dismissed_at = CASE
                       WHEN ${body.dismissed === true}::boolean  THEN COALESCE(dismissed_at, now())
                       WHEN ${body.dismissed === false}::boolean THEN NULL
                       ELSE dismissed_at
                     END,
      user_note    = CASE WHEN ${noteProvided}::boolean THEN ${noteValue} ELSE user_note END,
      user_note_updated_at = CASE WHEN ${noteProvided}::boolean THEN now() ELSE user_note_updated_at END,
      action_done_at = CASE
                         WHEN ${actionProvided && body.action_done === true}::boolean  THEN COALESCE(action_done_at, now())
                         WHEN ${actionProvided && body.action_done === false}::boolean THEN NULL
                         ELSE action_done_at
                       END
    WHERE id = ${id}
    RETURNING id, is_saved, dismissed_at, user_note, action_done_at
  `;
  return json({ signal: rows[0] });
}
