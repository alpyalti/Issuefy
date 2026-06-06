"use client";

import Link from "next/link";
import AuthSidePanel from "./AuthSidePanel";

/* Split-pane auth chrome:
   - Desktop: form on the left, value/preview panel on the right
   - Mobile (<880px): single column, form only, panel hidden
   The right panel is consistent across /sign-in, /sign-up, /sign-in/forgot. */
export default function AuthShell({
  children,
  secondaryText,
  secondaryHref,
}: {
  children: React.ReactNode;
  secondaryText?: string;
  secondaryHref?: string;
}) {
  return (
    <div className="auth-grid">
      <section className="auth-shell">
        <header className="auth-top">
          <Link href="/" className="brand" aria-label="Issuefy home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/logo-ink.svg" className="brand-logo" alt="Issuefy" />
          </Link>
          {secondaryText && secondaryHref && (
            <Link href={secondaryHref} className="auth-top-link">{secondaryText}</Link>
          )}
        </header>
        <main className="auth-card">{children}</main>
        <ClerkAttribution />
      </section>
      <AuthSidePanel />
    </div>
  );
}

function ClerkAttribution() {
  return (
    <p className="auth-footer">
      Secured by <a href="https://clerk.com" target="_blank" rel="noopener noreferrer">Clerk</a> · By continuing you agree to our <Link href="/#contact">terms</Link>
    </p>
  );
}
