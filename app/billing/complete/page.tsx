import { assertCheckoutCompletionMode } from "@/lib/checkout-completion";
import CheckoutCompletion from "./CheckoutCompletion";
import "../../dashboard.css";
export const dynamic = "force-dynamic";
export default async function CompletionPage({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const sp = await searchParams;
  // Middleware authenticates this page; only the guarded API may create an app user.
  try {
    assertCheckoutCompletionMode(sp.session_id);
  } catch {
    return <main className="page-wrap"><h1>Checkout unavailable</h1>
      <p>This checkout cannot be confirmed in this billing environment.</p></main>;
  }
  return <CheckoutCompletion sessionId={sp.session_id} />;
}
