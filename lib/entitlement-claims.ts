import { withTx } from "./db";
import { getLimits } from "./usage";
import { conflict, json, notFound, rateLimited } from "./api";

/** Serialize account-wide quota decisions. Read counts in a subsequent statement
 * so READ COMMITTED sees the transaction that previously held the owner lock.
 * NO KEY UPDATE also avoids blocking foreign-key checks against the owner. */
export async function claimManualRefresh(userId: string, projectId: string, admin: boolean) {
  return withTx(async client => {
    const owner = await client.query<{ id: string; plan: string }>(`
      SELECT u.id, u.plan FROM users u JOIN projects p ON p.user_id = u.id
      WHERE p.id = $1 FOR NO KEY UPDATE OF u
    `, [projectId]);
    if (!owner.rows[0]) return notFound();
    const project = await client.query<{ last_manual_refresh_at: string | null; cooling_down: boolean; is_active: boolean }>(`
      SELECT p.last_manual_refresh_at, p.is_active,
             p.last_manual_refresh_at > clock_timestamp() - interval '1 hour' AS cooling_down
      FROM projects p JOIN project_members pm ON pm.project_id = p.id
      WHERE p.id = $1 AND p.user_id = $2 AND pm.user_id = $3 AND pm.role IN ('owner','editor')
    `, [projectId, owner.rows[0].id, userId]);
    if (!project.rows[0]) return notFound();
    // Preserve the worker's existing paused-scan no-op without reserving quota.
    if (project.rows[0].is_active === false) return json({
      jobId: "skipped-paused", status: "completed",
      sourcesNew: 0, sourcesRefreshed: 0, serpCallsUsed: 0, scrapeCallsUsed: 0,
      signalsInserted: 0, signalsRejected: 0, modelUsed: null,
      summaryStatus: "skipped", summaryDate: null, errors: ["project is paused"],
    });
    if (!admin) {
      if (project.rows[0].cooling_down) return rateLimited("You can refresh this project once per hour.");
      const count = await client.query<{ n: number }>(`
        SELECT COUNT(*)::int AS n FROM scrape_jobs sj JOIN projects p ON p.id = sj.project_id
        WHERE p.user_id = $1 AND sj.job_type = 'manual'
          AND sj.created_at >= clock_timestamp() - interval '24 hours'
      `, [owner.rows[0].id]);
      if (count.rows[0].n >= getLimits(owner.rows[0].plan).manualRefreshesPerDay) {
        return rateLimited("You've used all your refreshes for today.");
      }
    }
    // Pending is a durable quota reservation, including if the handler dies
    // before starting the worker. Workers consume this same row exactly once.
    const job = await client.query<{ id: string }>(`
      INSERT INTO scrape_jobs (project_id, status, job_type, created_at)
      VALUES ($1, 'pending', 'manual', clock_timestamp()) RETURNING id
    `, [projectId]);
    await client.query(`UPDATE projects SET last_manual_refresh_at = clock_timestamp() WHERE id = $1`, [projectId]);
    return { jobId: job.rows[0].id };
  });
}

type Invitation = {
  id: string; email: string; role: "editor" | "viewer"; token: string;
  expires_at: string; created_at: string;
};

export async function reserveInvitation(ownerId: string, projectId: string, email: string, role: "editor" | "viewer") {
  return withTx(async client => {
    const owner = await client.query<{ plan: string }>(`
      SELECT u.plan FROM users u JOIN projects p ON p.user_id = u.id
      WHERE u.id = $1 AND p.id = $2 FOR NO KEY UPDATE OF u
    `, [ownerId, projectId]);
    if (!owner.rows[0]) return notFound();
    const member = await client.query(`
      SELECT 1 FROM project_members pm JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = $1 AND LOWER(u.email) = LOWER($2) LIMIT 1
    `, [projectId, email]);
    if (member.rows.length) return conflict("That person is already a member of this project.");
    const pending = await client.query(`
      SELECT 1 FROM project_invitations WHERE project_id = $1 AND LOWER(email) = LOWER($2)
        AND accepted_at IS NULL AND canceled_at IS NULL AND expires_at > clock_timestamp() LIMIT 1
    `, [projectId, email]);
    if (pending.rows.length) return conflict("An invitation to that email is already pending.");
    const count = await client.query<{ n: number }>(`
      SELECT (
        (SELECT COUNT(DISTINCT pm.user_id) FROM project_members pm
          JOIN projects p ON p.id = pm.project_id WHERE p.user_id = $1)
        + (SELECT COUNT(*) FROM project_invitations pi JOIN projects p ON p.id = pi.project_id
          WHERE p.user_id = $1 AND pi.accepted_at IS NULL AND pi.canceled_at IS NULL
            AND pi.expires_at > clock_timestamp())
      )::int AS n
    `, [ownerId]);
    const limit = getLimits(owner.rows[0].plan).seats;
    if (count.rows[0].n + 1 > limit) {
      return conflict(`Your plan allows ${limit} team seat${limit === 1 ? "" : "s"} (you plus invitees). Upgrade for more.`);
    }
    const result = await client.query<Invitation>(`
      INSERT INTO project_invitations (project_id, inviter_id, email, role)
      VALUES ($1, $2, $3, $4) RETURNING id, email, role, token, expires_at, created_at
    `, [projectId, ownerId, email, role]);
    return { invite: result.rows[0] };
  });
}

/** Convert the pending seat into membership under the same owner lock used by
 * invitation creation. Lock/recheck the token so cancellation and acceptance
 * cannot both win. All membership/token writes commit or roll back together. */
export async function acceptInvitation(token: string, userId: string, email: string) {
  return withTx(async client => {
    const owner = await client.query(`
      SELECT u.id FROM users u JOIN projects p ON p.user_id = u.id
      JOIN project_invitations pi ON pi.project_id = p.id
      WHERE pi.token = $1 FOR NO KEY UPDATE OF u
    `, [token]);
    if (!owner.rows.length) return notFound();
    const result = await client.query<{
      id: string; project_id: string; inviter_id: string; email: string;
      role: "editor" | "viewer"; accepted_at: string | null; canceled_at: string | null; expired: boolean;
    }>(`
      SELECT id, project_id, inviter_id, email, role, accepted_at, canceled_at,
             expires_at <= clock_timestamp() AS expired
      FROM project_invitations WHERE token = $1 FOR UPDATE
    `, [token]);
    const invite = result.rows[0];
    if (!invite) return notFound();
    if (invite.accepted_at) return conflict("This invitation has already been accepted.");
    if (invite.canceled_at) return conflict("This invitation has been canceled.");
    if (invite.expired) return conflict("This invitation has expired.");
    if (invite.email.toLowerCase() !== email.toLowerCase()) {
      return conflict(`This invitation is for ${invite.email}. Sign in with that email to accept.`);
    }
    await client.query(`
      INSERT INTO project_members (project_id, user_id, role, invited_by) VALUES ($1, $2, $3, $4)
      ON CONFLICT (project_id, user_id) DO NOTHING
    `, [invite.project_id, userId, invite.role, invite.inviter_id]);
    await client.query(`UPDATE project_invitations SET accepted_at = clock_timestamp() WHERE id = $1`, [invite.id]);
    await client.query(`
      UPDATE project_invitations SET canceled_at = COALESCE(canceled_at, clock_timestamp())
      WHERE project_id = $1 AND LOWER(email) = LOWER($2) AND id <> $3
        AND accepted_at IS NULL AND canceled_at IS NULL
    `, [invite.project_id, invite.email, invite.id]);
    return { projectId: invite.project_id, role: invite.role };
  });
}
