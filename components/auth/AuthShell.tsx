"use client";

import Link from "next/link";

/* Shared auth-page chrome: brand wordmark top-left, optional secondary
   action top-right (e.g. "Already a member? Sign in"), centered card. */
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
    <div className="auth-shell">
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
