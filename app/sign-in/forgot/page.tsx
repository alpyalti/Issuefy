import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import "../../auth.css";

export const metadata = { title: "Reset password — Issuefy" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell secondaryText="Back to sign in" secondaryHref="/sign-in">
      <ResetPasswordForm />
    </AuthShell>
  );
}
