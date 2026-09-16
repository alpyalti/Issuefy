import type { PoolClient } from "@neondatabase/serverless";
import { withTx } from "./db";
import { conflict, notFound } from "./api";

/** Existing-project additions share a project lock; count after acquiring it
 * in a separate READ COMMITTED statement so a waiting writer sees the commit.
 * Initial setup writes an uncommitted new project and needs no competing lock.
 */
export async function addWatchlistItem<T>(
  callerId: string, projectId: string, ownerId: string,
  kind: "competitors" | "keywords", limit: number,
  insert: (client: PoolClient) => Promise<T>,
): Promise<T | Response> {
  return withTx(async (client) => {
    await client.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    const project = await client.query(
      "SELECT id FROM projects WHERE id=$1 AND user_id=$2 FOR NO KEY UPDATE", [projectId, ownerId],
    );
    if (!project.rows.length) return notFound();
    // Recheck membership after any lock wait; hold it through insertion so a
    // concurrent revocation cannot leave a stale authorization check.
    const membership = await client.query(`SELECT role FROM project_members
      WHERE project_id=$1 AND user_id=$2 AND role IN ('owner','editor') FOR SHARE`, [projectId, callerId]);
    if (!membership.rows.length) return notFound();
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM ${kind} WHERE project_id=$1`, [projectId]);
    if (rows[0].n >= limit) {
      const noun = kind === "competitors" ? "competitor" : "keyword";
      return conflict(`This project allows ${limit} ${noun}${limit === 1 ? "" : "s"}. Remove one or upgrade your plan.`);
    }
    return insert(client);
  });
}
