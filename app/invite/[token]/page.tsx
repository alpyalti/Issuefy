import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { Icon } from "@/components/icons/Icon";
import InvitationAcceptButton from "./InvitationAcceptButton";
import "../../auth.css";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "You're invited — Issuefy" };

type Ctx = { params: Promise<{ token: string }> };

interface InvitationRow {
  id: string;
  project_id: string;
  email: string;
  role: "editor" | "viewer";
  expires_at: string;
  accepted_at: string | null;
  canceled_at: string | null;
  inviter_name: string | null;
  inviter_email: string;
  project_name: string;
}

/**
 * /invite/:token — public landing for an invitation email link.
 *
 * Public route (not in middleware.ts isProtected list) so signed-out users
 * can land here from the email. Three branches:
 *
 *   1. No matching invitation (or expired / accepted / canceled): generic
 *      "this invitation has expired or already been used" — never leak the
 *      project name.
 *   2. Signed in with the matching email: show "Accept invitation" button.
 *   3. Signed in with a different email: gentle mismatch message.
 *   4. Signed out: show project + inviter, button to /sign-up?invite={token}
 *      with the email pre-filled and a link to sign in if they have an
 *      existing account with that email.
 */
export default async function InvitationPage({ params }: Ctx) {
  const { token } = await params;
  const sql = requireSql();
  const rows = (await sql`
    SELECT pi.id, pi.project_id, pi.email, pi.role, pi.expires_at,
           pi.accepted_at, pi.canceled_at,
           inviter.name AS inviter_name, inviter.email AS inviter_email,
           p.name AS project_name
      FROM project_invitations pi
      JOIN users inviter ON inviter.id = pi.inviter_id
      JOIN projects p ON p.id = pi.project_id
     WHERE pi.token = ${token}
     LIMIT 1
  `) as InvitationRow[];

  const invite = rows[0];
  const expired = invite && new Date(invite.expires_at).getTime() < Date.now();
  const dead = !invite || invite.accepted_at || invite.canceled_at || expired;

  if (dead) {
    return (
      <div className="auth-shell" style={{ alignItems: "center" }}>
        <main className="auth-card" style={{ textAlign: "center", gap: 16 }}>
          <Icon name="Alert02Icon" size={28} stroke={1.6} color="var(--ink-3)" />
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em" }}>
            This invitation isn&apos;t valid.
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
            It may have expired, been canceled, or already been accepted. Ask the person who invited you to send a fresh one.
          </p>
          <Link href="/" className="btn btn-ghost">Back to Issuefy</Link>
        </main>
      </div>
    );
  }

  const inviterLabel = invite.inviter_name?.trim() || invite.inviter_email;
  const { userId } = await auth();

  // Logged-in branches
  if (userId) {
    const user = await getOrCreateUser();
    const emailMatches = user.email.toLowerCase() === invite.email.toLowerCase();
    if (!emailMatches) {
      return (
        <div className="auth-shell" style={{ alignItems: "center" }}>
          <main className="auth-card" style={{ textAlign: "center", gap: 16 }}>
            <Icon name="Alert02Icon" size={28} stroke={1.6} color="var(--warn)" />
            <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em" }}>
              Wrong account.
            </h1>
            <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
              This invitation is for <b>{invite.email}</b>. You&apos;re currently signed in as <b>{user.email}</b>.
              Sign out and open the link again, or ask {inviterLabel} to re-send the invitation to your address.
            </p>
            <Link href="/dashboard" className="btn btn-ghost">Back to dashboard</Link>
          </main>
        </div>
      );
    }
    // Match — show the accept button.
    return (
      <div className="auth-shell" style={{ alignItems: "center" }}>
        <main className="auth-card" style={{ textAlign: "center", gap: 14 }}>
          <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".14em", textTransform: "uppercase" }}>
            Team invitation
          </p>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
            {inviterLabel} invited you to <em style={{ fontStyle: "italic" }}>{invite.project_name}</em>.
          </h1>
          <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
            You&apos;ll be added as a {invite.role}. Click below to join the project.
          </p>
          <InvitationAcceptButton token={token} />
        </main>
      </div>
    );
  }

  // Signed out — point at sign-up with the invitation token + pre-fill email.
  return (
    <div className="auth-shell" style={{ alignItems: "center" }}>
      <main className="auth-card" style={{ textAlign: "center", gap: 14 }}>
        <p style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".14em", textTransform: "uppercase" }}>
          Team invitation
        </p>
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1.2 }}>
          {inviterLabel} invited you to <em style={{ fontStyle: "italic" }}>{invite.project_name}</em>.
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55 }}>
          Create an account with <b>{invite.email}</b> to accept. We&apos;ll add you as a {invite.role} on the project — you won&apos;t need a separate subscription.
        </p>
        <Link href={`/sign-up?invite=${encodeURIComponent(token)}`} className="btn btn-accent">
          Create my account →
        </Link>
        <p style={{ fontSize: 12, color: "var(--ink-3)" }}>
          Already have an account? <Link href={`/sign-in?invite=${encodeURIComponent(token)}`} className="auth-link">Sign in</Link>
        </p>
      </main>
    </div>
  );
}
