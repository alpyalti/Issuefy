import { requireUser } from "@/lib/clerk-user";
import { checkoutCompletion, CheckoutVerificationError } from "@/lib/checkout-completion";
import { json } from "@/lib/api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  try {
    const state = await checkoutCompletion(user.id, new URL(req.url).searchParams.get("session_id"));
    return json(state, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return json({ error: e instanceof CheckoutVerificationError ? e.message : "We couldn’t verify checkout. Please retry shortly." },
      { status: e instanceof CheckoutVerificationError ? 400 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
