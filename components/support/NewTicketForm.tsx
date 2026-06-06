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
 * Open-a-ticket form. Validates client-side, POSTs to /api/support/tickets,
 * then routes to the ticket detail page. Styling lives in support.css so the
 * inputs match the rest of the dashboard surface (no auth-page borrowed CSS).
 *
 * `basePath` is the URL prefix to navigate to on success — passed in by the
 * page wrapper so the form works both inside the dashboard shell
 * (/dashboard/[projectId]/support) and from any other entry point that might
 * mount it later.
 */
export default function NewTicketForm({ basePath }: { basePath: string }) {
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
    if (cleanSubject.length < 3) { setErr("Give the ticket a short subject (≥ 3 characters)."); return; }
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
      router.push(`${basePath}/tickets/${ticketId}`);
    } catch {
      setErr("Couldn't reach the server. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="support-form" noValidate>
      {err && (
        <div className="support-error">
          <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
          <span>{err}</span>
        </div>
      )}

      <div className="support-form-row">
        <div className="support-field">
          <label className="support-label" htmlFor="ticket-subject">Subject</label>
          <input
            id="ticket-subject"
            className="support-input"
            placeholder="Short summary of the issue"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={submitting}
            maxLength={200}
            autoComplete="off"
          />
        </div>
        <div className="support-field">
          <label className="support-label" htmlFor="ticket-category">Category</label>
          <select
            id="ticket-category"
            className="support-select"
            value={category}
            onChange={(e) => setCategory(e.target.value as typeof CATEGORIES[number]["value"])}
            disabled={submitting}
          >
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
      </div>

      <div className="support-field">
        <label className="support-label" htmlFor="ticket-body">Details</label>
        <textarea
          id="ticket-body"
          className="support-textarea"
          placeholder="What were you trying to do? What happened instead? Anything we should know — error message, URL, steps to reproduce — helps."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={submitting}
          rows={6}
          maxLength={10_000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(e); }
          }}
        />
      </div>

      <div className="support-form-foot">
        <span className="support-counter">⌘/Ctrl + Enter to send · {body.length} / 10,000</span>
        <button type="submit" className="btn btn-accent" disabled={submitting}>
          {submitting ? (
            <><Icon name="Loading03Icon" size={16} stroke={2} className="spin" /> Sending…</>
          ) : (
            <><Icon name="Mail01Icon" size={15} stroke={1.8} /> Send ticket</>
          )}
        </button>
      </div>
    </form>
  );
}
