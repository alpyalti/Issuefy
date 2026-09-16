import { SignIn } from "@clerk/nextjs";
import { activationUrl } from "@/lib/activation";
import AuthShell from "@/components/auth/AuthShell";
import "../../auth.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Complete sign in — Issuefy" };

/** The ClerkProvider retains the pending client sign-in attempt. Clerk owns all
 * remaining verification/session-task UI; hash routing keeps its internal steps
 * on this dedicated page instead of our custom password-form catch-all. */
export default async function ContinueSignInPage({ searchParams }: {
  searchParams: Promise<{ plan?: string; billing?: string }>;
}) {
  const sp = await searchParams;
  return (
    <AuthShell secondaryText="Back to sign in →" secondaryHref={activationUrl(sp.plan, sp.billing, "/sign-in")}>
      <SignIn
        routing="hash"
        forceRedirectUrl={activationUrl(sp.plan, sp.billing, "/dashboard")}
        signUpUrl={activationUrl(sp.plan, sp.billing, "/sign-up")}
        signUpForceRedirectUrl={activationUrl(sp.plan, sp.billing)}
      />
    </AuthShell>
  );
}
