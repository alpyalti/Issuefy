"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";

export default function CronTriggerButton() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function fire() {
    setBusy(true); setResult(null);
    try {
      const res = await fetch("/api/admin/cron/trigger", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setResult(`✓ Dispatched ${data.dispatched ?? "—"} project worker(s)`);
      } else {
        setResult(`✗ ${res.status} — check server logs`);
      }
    } catch (e) {
      setResult(`✗ ${e instanceof Error ? e.message : "failed"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
      <button className="btn btn-accent" onClick={fire} disabled={busy}>
        <Icon name="RefreshIcon" size={15} stroke={1.8} className={busy ? "spin" : ""} />
        {busy ? "Dispatching…" : "Trigger cron now"}
      </button>
      {result && <span className="mono" style={{ fontSize: 12, color: result.startsWith("✓") ? "var(--pos)" : "var(--neg)" }}>{result}</span>}
    </div>
  );
}
