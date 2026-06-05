"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/icons/Icon";

export default function DangerZone({ email }: { email: string }) {
  const router = useRouter();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const confirmed = typed.trim().toLowerCase() === email.toLowerCase();

  async function destroy() {
    if (!confirmed || pending) return;
    setPending(true);
    try {
      await fetch("/api/account", { method: "DELETE" });
      // Sign out locally + go home. The DELETE already removed the Clerk user;
      // signOut just clears the local session cookie.
      await clerk.signOut({ redirectUrl: "/" });
    } catch {
      setPending(false);
      alert("Couldn't delete your account. Try again or contact support.");
    }
    router.refresh();
  }

  return (
    <section className="card" style={{ padding: 22, borderColor: "var(--neg-line)" }}>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--neg)", marginBottom: 8 }}>Danger zone</h2>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 540 }}>
        Deleting your account removes all your projects, signals, sources, and daily briefs — permanently.
        Your subscription will be canceled. This action cannot be undone.
      </p>
      {!open ? (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 14, color: "var(--neg)", borderColor: "var(--neg-line)" }}
          onClick={() => setOpen(true)}
        >
          <Icon name="Delete02Icon" size={14} stroke={1.8} /> Delete my account…
        </button>
      ) : (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
            Type your email <b style={{ color: "var(--ink)" }}>{email}</b> to confirm.
          </p>
          <input
            className="modal-input"
            placeholder={email}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => { setOpen(false); setTyped(""); }}>Cancel</button>
            <button
              className="btn btn-accent"
              style={{ background: "var(--neg)" }}
              onClick={destroy}
              disabled={!confirmed || pending}
            >
              {pending ? "Deleting…" : "Yes, delete my account"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
