import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import AuthShell from "@/components/auth/AuthShell";
import SignUpForm from "@/components/auth/SignUpForm";
import "../../auth.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account — Issuefy" };

type SearchParams = Promise<{ invite?: string }>;

/**
 * Sign-up. If a ?invite=<token> param is present (link came from an
 * invitation email), we resolve the invitation server-side and pass the
 * email + token down to SignUpForm so:
 *   - the email field is pre-filled and disabled
 *   - after verification, the form skips /onboarding (and Stripe Checkout)
 *     and instead claims the invitation, sending the new user straight to
 *     /dashboard/{projectId} as an editor/viewer on the inviter's plan.
 */
export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const { userId } = await auth();
  const sp = await searchParams;
  const inviteToken = sp.invite?.trim() || null;

  // Already signed in? If they followed an invite link, send them to the
  // invite page so the accept button shows. Otherwise off to /dashboard.
  if (userId) {
    redirect(inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : "/dashboard");
  }

  let invitationEmail: string | null = null;
  if (inviteToken) {
    const sql = requireSql();
    const rows = (await sql`
      SELECT email, expires_at, accepted_at, canceled_at
        FROM project_invitations
       WHERE token = ${inviteToken}
       LIMIT 1
    `) as Array<{ email: string; expires_at: string; accepted_at: string | null; canceled_at: string | null }>;
    const inv = rows[0];
    // Only pre-fill (and skip onboarding later) for invitations that are
    // actually claimable right now.
    if (inv && !inv.accepted_at && !inv.canceled_at && new Date(inv.expires_at).getTime() > Date.now()) {
      invitationEmail = inv.email;
    }
  }

  return (
    <AuthShell secondaryText="Already a member? Sign in →" secondaryHref="/sign-in">
      <SignUpForm inviteToken={invitationEmail ? inviteToken : null} invitationEmail={invitationEmail} />
    </AuthShell>
  );
}
