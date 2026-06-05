import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { json, notFound, ownedSignal } from "@/lib/api";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/signals/:id/sources — sources cited by a single signal.
 * Ownership: join through signals → projects.user_id (PRD §20).
 */
export async function GET(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: signalId } = await params;
  const owned = await ownedSignal(user.id, signalId);
  if (!owned) return notFound();

  const sql = requireSql();
  const rows = await sql`
    SELECT s.id, s.title, s.url, s.domain, s.source_type, s.scraped_at, s.content_snippet
    FROM signal_sources ss
    JOIN sources s ON s.id = ss.source_id
    WHERE ss.signal_id = ${signalId}
    ORDER BY s.scraped_at DESC
  `;
  return json({ sources: rows });
}
