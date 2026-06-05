import AuthShell from "@/components/auth/AuthShell";
import SignInForm from "@/components/auth/SignInForm";
import "../../auth.css";

export const metadata = { title: "Sign in — Issuefy" };

export default function SignInPage() {
  return (
    <AuthShell secondaryText="Create an account →" secondaryHref="/sign-up">
      <SignInForm />
    </AuthShell>
  );
}
