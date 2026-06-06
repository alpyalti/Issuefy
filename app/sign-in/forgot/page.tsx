import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import ResetPasswordForm from "@/components/auth/ResetPasswordForm";
import "../../auth.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reset password — Issuefy" };

export default async function ForgotPasswordPage() {
  // Already signed in? They don't need to reset — send them in.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  return (
    <AuthShell secondaryText="Back to sign in" secondaryHref="/sign-in">
      <ResetPasswordForm />
    </AuthShell>
  );
}
