"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

/**
 * Filter chips on the admin /support queue. Drives the URL query string —
 * the server component re-runs with the new filters on every change.
 */
const STATUSES = [
  { value: "", label: "Active" }, // omit closed
  { value: "open", label: "Open" },
  { value: "pending", label: "Pending" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
] as const;

const PRIORITIES = [
  { value: "", label: "Any priority" },
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
] as const;

export default function SupportFilterBar({
  initialStatus, initialPriority, initialQ,
}: {
  initialStatus: string | null;
  initialPriority: string | null;
  initialQ: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(initialQ);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value && value !== "") next.set(key, value);
    else next.delete(key);
    router.push(`/admin/support${next.toString() ? "?" + next.toString() : ""}`);
  }

  function submitQuery(e: React.FormEvent) {
    e.preventDefault();
    setParam("q", q.trim() || null);
  }

  return (
    <section className="card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", alignSelf: "center", marginRight: 6 }}>Status</span>
        {STATUSES.map((s) => {
          const isOn = (initialStatus ?? "") === s.value;
          return (
            <button
              key={s.value}
              className={"seg-btn " + (isOn ? "on" : "")}
              onClick={() => setParam("status", s.value || null)}
              type="button"
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", letterSpacing: ".1em", textTransform: "uppercase", marginRight: 6 }}>Priority</span>
        {PRIORITIES.map((p) => {
          const isOn = (initialPriority ?? "") === p.value;
          return (
            <button
              key={p.value}
              className={"seg-btn " + (isOn ? "on" : "")}
              onClick={() => setParam("priority", p.value || null)}
              type="button"
            >
              {p.label}
            </button>
          );
        })}
        <form onSubmit={submitQuery} style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <input
            className="modal-input"
            placeholder="Search subject…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ height: 32, fontSize: 13, padding: "0 10px", width: 200 }}
          />
          <button type="submit" className="btn btn-quiet btn-sm">Search</button>
        </form>
      </div>
    </section>
  );
}
