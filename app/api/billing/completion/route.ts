import { auth } from "@clerk/nextjs/server";
import { requireUser } from "@/lib/clerk-user";
import { checkoutCompletion, CheckoutVerificationError, assertCheckoutCompletionMode, prepareCheckoutCompletion } from "@/lib/checkout-completion";
import { json } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const sessionId = new URL(req.url).searchParams.get("session_id");
    assertCheckoutCompletionMode(sessionId);
    // Read-only identity check: do not retrieve provider objects for anonymous requests.
    const { userId } = await auth();
    if (!userId) return json({ error: "Sign in to confirm checkout." }, { status: 401 });
    const session = await prepareCheckoutCompletion(sessionId);
    const user = await requireUser();
    if (user instanceof Response) return user;
    const state = await checkoutCompletion(user.id, sessionId, session);
    return json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return json({ error: e instanceof CheckoutVerificationError ? e.message : "We couldn’t verify checkout. Please retry shortly." },
      { status: e instanceof CheckoutVerificationError ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
