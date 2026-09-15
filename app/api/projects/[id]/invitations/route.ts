import { z } from "zod";
import { requireUser } from "@/lib/clerk-user";
import { ensureProjectSubscriptionApi } from "@/lib/billing-gate";
import { reserveInvitation } from "@/lib/entitlement-claims";
import { adminProject, conflict, json, notFound, parseJson } from "@/lib/api";
import { sendInvitationEmail } from "@/lib/mailer";
import { captureBreadcrumb, captureError } from "@/lib/sentry";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["editor", "viewer"]),
}).strict();

/**
 * POST /api/projects/:id/invitations — owner sends a project invitation.
 *
 * Seat cap is enforced per-account: count distinct users with any role on any
 * project this user owns (the owner himself counts once even if he owns
 * multiple) + pending non-expired invites. Reject when count + 1 > limits.seats.
 */
export async function POST(req: Request, { params }: Ctx) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const { id: projectId } = await params;
  const proj = await adminProject<{ id: string; name: string; user_id: string }>(user.id, projectId);
  if (!proj) return notFound();
  const billing = await ensureProjectSubscriptionApi(user.id, projectId);
  if (billing instanceof Response) return billing;

  const body = await parseJson(req, bodySchema);
  if (body instanceof Response) return body;

  // Inviting your own email is silly — also a footgun against the same-email
  // accept flow which expects a distinct user.
  if (body.email.toLowerCase() === user.email.toLowerCase()) {
    return conflict("You can't invite yourself.");
  }

  const reservation = await reserveInvitation(billing.ownerId, projectId, body.email, body.role);
  if (reservation instanceof Response) return reservation;
  const { invite } = reservation;

  // Send the email best-effort — non-fatal so a Resend hiccup doesn't lose
  // the invitation (it's already in the DB; the owner can resend later).
  const appUrl = (process.env.APP_URL || "https://issuefy.app").replace(/\/+$/, "");
  try {
    await sendInvitationEmail(invite.email, {
      inviterName: user.name || user.email,
      inviterEmail: user.email,
      projectName: proj.name,
      role: invite.role,
      acceptUrl: `${appUrl}/invite/${encodeURIComponent(invite.token)}`,
      appUrl,
    });
    captureBreadcrumb("invitation sent", { projectId, invitee: invite.email, role: invite.role });
  } catch (e) {
    captureError(e, { stage: "invitation.email", projectId });
  }

  // Don't leak the token in the response — it's only useful inside the email.
  // Inviter can cancel + re-send if needed.
  return json({
    invitation: {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
      created_at: invite.created_at,
    },
  }, { status: 201 });
}
