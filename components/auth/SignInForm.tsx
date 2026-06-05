"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs/legacy";
interface ClerkAPIError { code?: string; message?: string; longMessage?: string; }
import { Icon } from "@/components/icons/Icon";
import SocialProviders from "./SocialProviders";

function friendlyError(err: ClerkAPIError | undefined): string {
  if (!err) return "Something went wrong — please try again.";
  switch (err.code) {
    case "form_identifier_not_found": return "We couldn't find an account with that email.";
    case "form_password_incorrect": return "That password isn't right. Try again or reset it.";
    case "form_password_pwned": return "That password has appeared in a data breach — please use a different one.";
    case "session_exists": return "You're already signed in.";
    default: return err.longMessage || err.message || "Something went wrong.";
  }
}

export default function SignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const attempt = await signIn.create({ identifier: email.trim(), password });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.push("/dashboard");
      } else {
        // Edge case (2FA etc.) — push them through Clerk's hosted flow.
        router.push("/sign-in/continue");
      }
    } catch (err) {
      const e = err as { errors?: ClerkAPIError[] };
      setError(friendlyError(e.errors?.[0]));
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="auth-head">
        <h1>Welcome back.</h1>
        <p>Sign in to pick up where you left off.</p>
      </header>

      <SocialProviders mode="sign-in" />

      <div className="auth-divider">or with email</div>

      <form onSubmit={handleSubmit} className="auth-fields" noValidate>
        {error && (
          <div className="auth-error">
            <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
            <span>{error}</span>
          </div>
        )}
        <div className="auth-field">
          <label className="auth-label" htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            required
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div className="auth-field">
          <div className="auth-row">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <Link href="/sign-in/forgot" className="auth-link">Forgot?</Link>
          </div>
          <input
            id="auth-password"
            type="password"
            autoComplete="current-password"
            required
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </div>
        <div id="clerk-captcha" />
        <button className="btn btn-accent auth-submit" type="submit" disabled={submitting || !email || !password}>
          {submitting ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" />Signing in…</> : "Sign in"}
        </button>
      </form>

      <p className="auth-row-secondary">
        New to Issuefy? <Link href="/sign-up" className="auth-link">Create an account</Link>
      </p>
    </>
  );
}
