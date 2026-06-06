import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AuthShell from "@/components/auth/AuthShell";
import SignUpForm from "@/components/auth/SignUpForm";
import "../../auth.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your account — Issuefy" };

export default async function SignUpPage() {
  // Already signed in? Send them to the app instead of letting the sign-up
  // form try to create a duplicate session.
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  return (
    <AuthShell secondaryText="Already a member? Sign in →" secondaryHref="/sign-in">
      <SignUpForm />
    </AuthShell>
  );
}
