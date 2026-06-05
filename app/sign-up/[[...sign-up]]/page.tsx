import AuthShell from "@/components/auth/AuthShell";
import SignUpForm from "@/components/auth/SignUpForm";
import "../../auth.css";

export const metadata = { title: "Create your account — Issuefy" };

export default function SignUpPage() {
  return (
    <AuthShell secondaryText="Already a member? Sign in →" secondaryHref="/sign-in">
      <SignUpForm />
    </AuthShell>
  );
}
