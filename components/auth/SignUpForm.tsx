"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignUp } from "@clerk/nextjs/legacy";
interface ClerkAPIError { code?: string; message?: string; longMessage?: string; }
import { Icon } from "@/components/icons/Icon";
import SocialProviders from "./SocialProviders";

function friendlyError(err: ClerkAPIError | undefined): string {
  if (!err) return "Something went wrong — please try again.";
  switch (err.code) {
    case "form_identifier_exists": return "An account with that email already exists. Try signing in instead.";
    case "form_password_pwned": return "That password has appeared in a data breach — please use a stronger one.";
    case "form_password_length_too_short": return "Password must be at least 8 characters.";
    case "form_param_format_invalid": return "Please check that your email looks right.";
    case "verification_failed": return "That code didn't match. Try again or resend.";
    case "form_code_incorrect": return "That code isn't quite right. Try again.";
    case "verification_expired": return "That code expired. Click resend to get a new one.";
    default: return err.longMessage || err.message || "Something went wrong.";
  }
}

type Stage = "credentials" | "verify";

export default function SignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const billingParam = searchParams.get("billing");

  const [stage, setStage] = useState<Stage>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resentAt, setResentAt] = useState<number | null>(null);

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStage("verify");
    } catch (err) {
      setError(friendlyError((err as { errors?: ClerkAPIError[] }).errors?.[0]));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!isLoaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (attempt.status === "complete") {
        await setActive({ session: attempt.createdSessionId });
        // Redirect: if a plan was selected on the pricing page, send them to
        // /upgrade afterward so they can finish onboarding → checkout.
        if (planParam) {
          const u = new URL("/onboarding", window.location.origin);
          u.searchParams.set("plan", planParam);
          if (billingParam) u.searchParams.set("billing", billingParam);
          router.push(u.pathname + u.search);
        } else {
          router.push("/onboarding");
        }
      } else {
        setError("We couldn't complete sign-up. Please try again.");
      }
    } catch (err) {
      setError(friendlyError((err as { errors?: ClerkAPIError[] }).errors?.[0]));
    } finally {
      setSubmitting(false);
    }
  }

  async function resendCode() {
    if (!isLoaded || submitting) return;
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setResentAt(Date.now());
    } catch (err) {
      setError(friendlyError((err as { errors?: ClerkAPIError[] }).errors?.[0]));
    }
  }

  return stage === "credentials" ? (
    <>
      <header className="auth-head">
        <h1>Start your morning brief.</h1>
        <p>Create your account — no card required to try Issuefy.</p>
      </header>

      <SocialProviders mode="sign-up" />

      <div className="auth-divider">or with email</div>

      <form onSubmit={handleCredentials} className="auth-fields" noValidate>
        {error && (
          <div className="auth-error">
            <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
            <span>{error}</span>
          </div>
        )}
        <div className="auth-field">
          <label className="auth-label" htmlFor="su-email">Work email</label>
          <input
            id="su-email"
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
          <label className="auth-label" htmlFor="su-password">Password</label>
          <input
            id="su-password"
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
        <div id="clerk-captcha" />
        <button className="btn btn-accent auth-submit" type="submit" disabled={submitting || !email || password.length < 8}>
          {submitting ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" />Creating account…</> : "Create account"}
        </button>
      </form>

      <p className="auth-row-secondary">
        Already have an account? <Link href="/sign-in" className="auth-link">Sign in</Link>
      </p>
    </>
  ) : (
    <VerifyCodeStage
      email={email}
      code={code}
      setCode={setCode}
      submitting={submitting}
      error={error}
      onSubmit={handleVerify}
      onResend={resendCode}
      resentAt={resentAt}
    />
  );
}

function VerifyCodeStage({
  email, code, setCode, submitting, error, onSubmit, onResend, resentAt,
}: {
  email: string;
  code: string;
  setCode: (v: string) => void;
  submitting: boolean;
  error: string | null;
  onSubmit: (e: FormEvent) => void;
  onResend: () => void;
  resentAt: number | null;
}) {
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  useEffect(() => { inputsRef.current[0]?.focus(); }, []);

  function setDigit(i: number, val: string) {
    const clean = val.replace(/\D/g, "").slice(0, 1);
    const arr = code.padEnd(6, " ").split("");
    arr[i] = clean || " ";
    const next = arr.join("").replace(/\s/g, "");
    setCode(next);
    if (clean && i < 5) inputsRef.current[i + 1]?.focus();
  }

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text) {
      e.preventDefault();
      setCode(text);
      inputsRef.current[Math.min(text.length, 5)]?.focus();
    }
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !(e.target as HTMLInputElement).value && i > 0) {
      inputsRef.current[i - 1]?.focus();
    }
  }

  return (
    <>
      <header className="auth-head">
        <h1>Check your inbox.</h1>
        <p>We sent a 6-digit code to <b style={{ color: "var(--ink)" }}>{email}</b>. Enter it below to finish creating your account.</p>
      </header>

      <form onSubmit={onSubmit} className="auth-fields">
        {error && (
          <div className="auth-error">
            <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
            <span>{error}</span>
          </div>
        )}
        <div className="auth-code-fields" onPaste={onPaste}>
          {Array.from({ length: 6 }).map((_, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              className="auth-code-input"
              type="text"
              inputMode="numeric"
              maxLength={1}
              autoComplete="one-time-code"
              value={code[i] || ""}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              disabled={submitting}
              aria-label={`Digit ${i + 1}`}
            />
          ))}
        </div>
        <button className="btn btn-accent auth-submit" type="submit" disabled={submitting || code.length < 6}>
          {submitting ? <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" />Verifying…</> : "Verify and continue"}
        </button>
      </form>

      <p className="auth-row-secondary">
        Didn&apos;t get it?{" "}
        <button type="button" className="auth-link" onClick={onResend} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          {resentAt ? "Code resent" : "Resend code"}
        </button>
      </p>
    </>
  );
}
