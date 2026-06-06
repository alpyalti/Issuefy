"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

export interface ThreadMessage {
  id: string;
  body: string;
  created_at: string;
  author_type: "user" | "admin";
  author_label: string;
}

/**
 * Conversation thread + reply form for a single ticket. The server component
 * does the initial render (preloaded messages); after a reply we router.refresh()
 * so the thread re-renders with the new message at the bottom.
 *
 * `isClosed` is set when the ticket is in 'closed' status — the reply form is
 * replaced by a small note pointing the user at opening a new ticket.
 */
export default function TicketThread({
  ticketId, messages, isClosed = false, replyEndpoint,
}: {
  ticketId: string;
  messages: ThreadMessage[];
  isClosed?: boolean;
  /** Override for the admin side which posts to /api/admin/support/tickets/:id/messages */
  replyEndpoint?: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest message on first paint + after each send.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [messages.length]);

  async function send() {
    if (pending || !body.trim()) return;
    setErr(null);
    setPending(true);
    try {
      const url = replyEndpoint ?? `/api/support/tickets/${encodeURIComponent(ticketId)}/messages`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (res.status === 409) {
        const { error } = await res.json().catch(() => ({ error: "This ticket is closed." }));
        setErr(error);
        return;
      }
      if (!res.ok) { setErr("Couldn't post the reply. Try again."); return; }
      setBody("");
      router.refresh();
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m) => <MessageBubble key={m.id} m={m} />)}
        <div ref={endRef} />
      </div>

      {isClosed ? (
        <div style={{ padding: 14, border: "1px dashed var(--line-2)", borderRadius: 10, background: "var(--surface-2)", color: "var(--ink-3)", fontSize: 13.5, textAlign: "center" }}>
          This ticket is closed. <a href="/support" className="auth-link">Open a new ticket</a> if you have a follow-up question.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: 14, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)" }}>
          {err && (
            <div className="auth-error">
              <Icon name="Alert02Icon" size={14} stroke={1.7} color="var(--neg)" />
              <span>{err}</span>
            </div>
          )}
          <textarea
            className="auth-input"
            placeholder="Write a reply…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            disabled={pending}
            style={{ height: "auto", padding: "12px 14px", lineHeight: 1.5, fontFamily: "var(--sans)", fontSize: 14, resize: "vertical" }}
            maxLength={10_000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>⌘/Ctrl + Enter to send · {body.length} / 10,000</span>
            <button className="btn btn-accent" onClick={send} disabled={pending || !body.trim()}>
              {pending ? "Sending…" : "Send reply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: ThreadMessage }) {
  const isAdmin = m.author_type === "admin";
  return (
    <div style={{
      alignSelf: isAdmin ? "flex-start" : "flex-end",
      maxWidth: "85%",
      display: "flex", flexDirection: "column", gap: 4,
    }}>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".04em" }}>
        {m.author_label} · {new Date(m.created_at).toLocaleString()}
      </span>
      <div style={{
        padding: "12px 14px",
        background: isAdmin ? "var(--surface)" : "var(--accent-bg)",
        border: `1px solid ${isAdmin ? "var(--line)" : "var(--accent-bg-2)"}`,
        borderRadius: 12,
        fontSize: 14, lineHeight: 1.55, color: "var(--ink)",
        whiteSpace: "pre-wrap",
      }}>
        {m.body}
      </div>
    </div>
  );
}
