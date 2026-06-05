import { redirect } from "next/navigation";

/* Phase 1 stub. Phase 2 replaces this with the full 6-step onboarding route
   (Welcome → Your company → Confirm company → Add competitors → Confirm
   competitor → Keywords → Finish), powered by /api/enrich. For now the
   first-run modal inside the dashboard handles the flow, so we just redirect. */
export default function OnboardingPage() {
  redirect("/dashboard");
}
