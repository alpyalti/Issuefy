import { requireUser } from "@/lib/clerk-user";
import { acceptInvitation } from "@/lib/entitlement-claims";
import { json } from "@/lib/api";
import { captureBreadcrumb } from "@/lib/sentry";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

/**
 * POST /api/invitations/:token/accept — claim an invitation.
 *
 * Validations:
 *   - Token exists and isn't expired / accepted / canceled
 *   - Caller's email matches the invitation's (case-insensitive)
 *   - Not already a member of the project (idempotent re-accept is fine)
 *
 * Side effects:
 *   - Inserts project_members (project_id, user_id, role, invited_by)
 *   - Stamps accepted_at on the invitation
 *   - Cancels any sibling invitations for the same project + email so a
 *     duplicate-send doesn't leave a stale token around
 *
 * Returns { projectId } — the caller redirects there.
 */
export async function POST(_req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { token } = await params;
  const accepted = await acceptInvitation(token, user.id, user.email);
  if (accepted instanceof Response) return accepted;
  captureBreadcrumb("invitation accepted", { projectId: accepted.projectId, userId: user.id, role: accepted.role });
  return json(accepted);
}
