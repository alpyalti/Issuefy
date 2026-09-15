import { activationUrl } from "@/lib/activation";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import SignInForm from "@/components/auth/SignInForm";
import "../../auth.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in — Issuefy" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ plan?: string; billing?: string }> }) {
  const sp = await searchParams;
  // Already signed in? Skip the form and let /dashboard handle the rest
  // (project picker / trial gate). Without this, clicking "Continue with
  // Google" while a session exists surfaces Clerk's session_exists error
  // instead of doing what the user expects.
  const { userId } = await auth();
  if (userId) redirect(activationUrl(sp.plan, sp.billing, "/dashboard"));
  return (
    <AuthShell secondaryText="Create an account →" secondaryHref={activationUrl(sp.plan, sp.billing, "/sign-up")}>
      <SignInForm />
    </AuthShell>
  );
}
