"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { activationUrl } from "@/lib/activation";

export default function CheckoutCompletion({ sessionId }: { sessionId?: string }) {
  const [attempt, setAttempt] = useState(0);
  const [message, setMessage] = useState("Confirming your subscription. This can take a moment.");
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = Date.now() + 60_000;
    setStopped(false);
    setMessage("Confirming your subscription. This can take a moment.");
    const timeout = setTimeout(() => {
      controller.abort();
      clearTimeout(timer);
      setStopped(true);
      setMessage("Your subscription is still being confirmed. You can check again safely; don’t start another checkout.");
    }, 60_000);
    async function check() {
      try {
        const res = await fetch(`/api/billing/completion${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`, { cache: "no-store", signal: controller.signal });
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (res.ok && data.status === "ready") {
          clearTimeout(timeout);
          window.location.replace(activationUrl(data.plan, data.billing, "/dashboard"));
          return;
        }
        if (res.status === 400 || res.status === 401) {
          clearTimeout(timeout);
          setMessage(data.error || "Sign in again to confirm your subscription.");
          setStopped(true);
          return;
        }
      } catch { /* Retry transient network/provider errors within the bounded window. */ }
      if (!controller.signal.aborted && Date.now() < deadline) timer = setTimeout(check, 2500);
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); clearTimeout(timeout); };
  }, [sessionId, attempt]);
  return <main className="page-wrap" style={{ maxWidth: 640, margin: "80px auto" }}>
    <h1>Confirming checkout</h1>
    <p role="status" style={{ margin: "20px 0" }}>{message}</p>
    {stopped && <button className="btn btn-accent" onClick={() => setAttempt((n) => n + 1)}>Check again</button>}
    <p style={{ marginTop: 24 }}><Link href="/support">Contact support</Link> · <Link href="/dashboard">Go to dashboard</Link></p>
  </main>;
}
