"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";

const STATUSES = ["open", "pending", "resolved", "closed"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

/**
 * Status + priority dropdowns on the admin ticket page. Both PATCH the same
 * route and router.refresh() so the badges + queue reorder pick up.
 */
export default function AdminTicketControls({
  ticketId, status, priority,
}: {
  ticketId: string;
  status: typeof STATUSES[number];
  priority: typeof PRIORITIES[number];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<"status" | "priority" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>, kind: "status" | "priority") {
    setPending(kind);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { setErr("Couldn't update — try again."); return; }
      router.refresh();
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase" }}>Status</span>
      <select
        className="modal-input"
        value={status}
        onChange={(e) => patch({ status: e.target.value }, "status")}
        disabled={pending === "status"}
        style={{ width: 140, height: 32, fontSize: 13, padding: "0 8px", paddingRight: 16 }}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", marginLeft: 6 }}>Priority</span>
      <select
        className="modal-input"
        value={priority}
        onChange={(e) => patch({ priority: e.target.value }, "priority")}
        disabled={pending === "priority"}
        style={{ width: 140, height: 32, fontSize: 13, padding: "0 8px", paddingRight: 16 }}
      >
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {err && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--neg)", fontSize: 12 }}>
          <Icon name="Alert02Icon" size={13} stroke={1.7} color="var(--neg)" /> {err}
        </span>
      )}
    </div>
  );
}
