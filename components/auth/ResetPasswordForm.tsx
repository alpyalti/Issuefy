"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs/legacy";
interface ClerkAPIError { code?: string; message?: string; longMessage?: string; }
import { Icon } from "@/components/icons/Icon";

type Stage = "request" | "reset";

export default function ResetPasswordForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function requestReset(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setStage("reset");
    } catch (err) {
      const e0 = (err as { errors?: ClerkAPIError[] }).errors?.[0];
      setError(e0?.code === "form_identifier_not_found"
        ? "We couldn't find an account with that email."
        : e0?.longMessage || e0?.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function applyReset(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const attempt = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password,
      });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        router.push("/dashboard");
      } else {
        setError("Reset wasn't completed. Try again.");
      }
    } catch (err) {
      const e0 = (err as { errors?: ClerkAPIError[] }).errors?.[0];
      setError(e0?.longMessage || e0?.message || "Reset failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return stage === "request" ? (
    <>
      <header className="auth-head">
        <h1>Reset your password.</h1>
        <p>Enter the email you signed up with — we&apos;ll send you a 6-digit code.</p>
      </header>
      <form onSubmit={requestReset} className="auth-fields" noValidate>
        {error && (
          <div className="auth-error">
            <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
            <span>{error}</span>
          </div>
        )}
        <div className="auth-field">
          <label className="auth-label" htmlFor="rp-email">Email</label>
          <input
            id="rp-email"
            type="email"
            autoComplete="email"
            required
            className="auth-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
          />
        </div>
        <button className="btn btn-accent auth-submit" type="submit" disabled={submitting || !email}>
          {submitting ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" />Sending…</> : "Send reset code"}
        </button>
      </form>
      <p className="auth-row-secondary">
        <Link href="/sign-in" className="auth-link">Back to sign in</Link>
      </p>
    </>
  ) : (
    <>
      <header className="auth-head">
        <h1>Choose a new password.</h1>
        <p>Enter the code we sent to <b style={{ color: "var(--ink)" }}>{email}</b>, then your new password.</p>
      </header>
      <form onSubmit={applyReset} className="auth-fields" noValidate>
        {error && (
          <div className="auth-error">
            <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
            <span>{error}</span>
          </div>
        )}
        <div className="auth-field">
          <label className="auth-label" htmlFor="rp-code">6-digit code</label>
          <input
            id="rp-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            required
            className="auth-input"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            disabled={submitting}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="rp-password">New password</label>
          <input
            id="rp-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="auth-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
          />
        </div>
        <button className="btn btn-accent auth-submit" type="submit" disabled={submitting || code.length < 6 || password.length < 8}>
          {submitting ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" />Resetting…</> : "Reset password and sign in"}
        </button>
      </form>
    </>
  );
}
