"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

const CATEGORIES = [
  { value: "general", label: "General question" },
  { value: "bug", label: "Bug report" },
  { value: "feature", label: "Feature request" },
  { value: "billing", label: "Billing" },
  { value: "account", label: "Account" },
] as const;

/**
 * New-ticket form. Validates client-side, posts to /api/support/tickets, then
 * routes to the ticket detail page so the user sees the thread they just
 * created. Emails are sent server-side as part of the POST.
 */
export default function NewTicketForm() {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<typeof CATEGORIES[number]["value"]>("general");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErr(null);
    const cleanSubject = subject.trim();
    const cleanBody = body.trim();
    if (cleanSubject.length < 3) { setErr("Give the ticket a short subject (≥ 3 chars)."); return; }
    if (cleanBody.length < 10) { setErr("Tell us a bit more — at least 10 characters."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: cleanSubject, category, body: cleanBody }),
      });
      if (res.status === 429) { setErr("You're submitting too fast — give it a moment."); return; }
      if (!res.ok) { setErr("Couldn't open the ticket. Try again."); return; }
      const { ticketId } = (await res.json()) as { ticketId: string };
      router.push(`/support/tickets/${ticketId}`);
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Open a ticket</h2>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: 560 }}>
          Tell us what&apos;s going on — we&apos;ll reply by email and you can track the thread on this page.
        </p>
      </header>

      {err && (
        <div className="auth-error">
          <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
          <span>{err}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px", gap: 12 }}>
        <div className="auth-field">
          <label className="auth-label" htmlFor="ticket-subject">Subject</label>
          <input
            id="ticket-subject"
            className="auth-input"
            placeholder="Short summary of the issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={submitting}
            maxLength={200}
          />
        </div>
        <div className="auth-field">
          <label className="auth-label" htmlFor="ticket-category">Category</label>
          <select
            id="ticket-category"
            className="auth-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number]["value"])}
            disabled={submitting}
            style={{ paddingRight: 18, cursor: "pointer" }}
          >
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="auth-field">
        <label className="auth-label" htmlFor="ticket-body">Details</label>
        <textarea
          id="ticket-body"
          className="auth-input"
          placeholder="What were you trying to do? What happened instead? Anything we should know — error message, URL, steps to reproduce — helps."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={submitting}
          rows={6}
          style={{ height: "auto", padding: "12px 14px", lineHeight: 1.5, fontFamily: "var(--sans)", fontSize: 14, resize: "vertical" }}
          maxLength={10_000}
        />
        <p className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)", letterSpacing: ".04em", marginTop: 4 }}>
          {body.length} / 10,000
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="submit" className="btn btn-accent" disabled={submitting}>
          {submitting ? (<><Icon name="Loading03Icon" size={16} stroke={2} className="spin" />Sending…</>) : "Send ticket"}
        </button>
      </div>
    </form>
  );
}
