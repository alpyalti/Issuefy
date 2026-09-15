import { getOrCreateUser } from "@/lib/clerk-user";
import CheckoutCompletion from "./CheckoutCompletion";
import "../../dashboard.css";
export const dynamic = "force-dynamic";
export default async function CompletionPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  await getOrCreateUser();
  const sp = await searchParams;
  return <CheckoutCompletion sessionId={sp.session_id} />;
}
