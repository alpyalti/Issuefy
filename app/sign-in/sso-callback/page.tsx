import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Icon } from "@/components/icons/Icon";
import "../../auth.css";

export const metadata = { title: "Signing you in… — Issuefy" };

/**
 * OAuth (Google) redirect lands here. Clerk's <AuthenticateWithRedirectCallback>
 * completes the handshake and then forwards to the `redirectUrlComplete` that was
 * set when the flow started (/dashboard for sign-in, /onboarding for sign-up).
 *
 * This must be a concrete route — the /sign-in/[[...sign-in]] catch-all would
 * otherwise just re-render the sign-in form and the OAuth flow would never
 * finish (which is exactly the bug this fixes). A static segment takes
 * precedence over the optional catch-all sibling.
 */
export default function SSOCallbackPage() {
  return (
    <div className="auth-shell" style={{ background: "var(--bg)" }}>
      <main className="auth-card" style={{ alignItems: "center", textAlign: "center", gap: 14 }}>
        <Icon name="Loading03Icon" size={26} stroke={2} className="spin" />
        <h1 style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em" }}>
          Signing you in…
        </h1>
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.5 }}>
          Hold on a moment while we finish connecting your account.
        </p>
      </main>
      <AuthenticateWithRedirectCallback />
    </div>
  );
}
