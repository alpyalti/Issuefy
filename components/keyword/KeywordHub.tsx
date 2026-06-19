"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { LineChart } from "@/components/charts/LineChart";
import { useDashboardRole, canManage } from "@/components/dashboard/dashboard-role-context";
import { LeadCard, type Lead } from "@/components/leads/LeadCard";
import { fmtAgo } from "@/lib/format";

/**
 * Keyword hub — per-keyword view: signal stats + 12-week trend, the keyword's
 * signals, and discovered leads (potential customers from Reddit / HN). Mirrors
 * the competitor hub's structure and reuses its hub-* styles.
 */
export interface KwRow { id: string; keyword: string; is_active: boolean; last_discovered_at: string | null; }
export interface KwStats { totalSignals: number; weekSignals: number; sources: number; leads: number; }
export interface KwTrendPoint { date: string; value: number; }
export interface KwCategory { category: string; count: number; }
export interface KwSignal { id: string; title: string; category: string; importance: "Low" | "Medium" | "High"; created_at: string; }

export default function KeywordHub({
  projectId, keyword, stats, trend, categories, signals, leads,
}: {
  projectId: string;
  keyword: KwRow;
  stats: KwStats;
  trend: KwTrendPoint[];
  categories: KwCategory[];
  signals: KwSignal[];
  leads: Lead[];
}) {
  const router = useRouter();
  const role = useDashboardRole();
  const canEdit = canManage(role);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  async function findLeads() {
    setScanMsg(null);
    setScanning(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/keywords/${keyword.id}/find-leads`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) { setScanMsg(body.error || "Scan runs once per hour per keyword."); return; }
      if (!res.ok) { setScanMsg(body.error || "Scan failed — try again."); return; }
      const n = body.leadsCreated ?? 0;
      setScanMsg(n > 0 ? `Found ${n} new conversation${n === 1 ? "" : "s"}.` : "No new conversations this scan.");
      router.refresh();
    } catch {
      setScanMsg("Scan failed — check your connection.");
    } finally {
      setScanning(false);
    }
  }

  const maxCat = Math.max(1, ...categories.map((c) => c.count));
  const activeLeads = leads.filter((l) => l.status !== "dismissed");

  const statCards = [
    { label: "Signals (total)", value: stats.totalSignals },
    { label: "Signals this week", value: stats.weekSignals },
    { label: "Sources discovered", value: stats.sources },
    { label: "Conversations", value: stats.leads },
  ];

  return (
    <div className="page-wrap hub">
      {/* Header */}
      <header className="hub-head">
        <div className="hub-id">
          <span className="hub-logo kw-logo"><Icon name="Tag01Icon" size={22} stroke={1.7} /></span>
          <div className="hub-id-meta">
            <h1 className="hub-name">{keyword.keyword}</h1>
            <div className="hub-sub">
              <span className={"kw-status " + (keyword.is_active ? "on" : "off")}>
                <span className="watch-live" /> {keyword.is_active ? "Active" : "Paused"}
              </span>
              <span className="hub-fetch-note">Last checked {fmtAgo(keyword.last_discovered_at)}</span>
            </div>
          </div>
        </div>
        {canEdit && (
          <div className="hub-actions">
            <button className="btn btn-ghost" onClick={findLeads} disabled={scanning}>
              <Icon name={scanning ? "Loading03Icon" : "Target01Icon"} size={15} stroke={1.7} className={scanning ? "spin" : ""} />
              {scanning ? "Scanning…" : "Find conversations now"}
            </button>
          </div>
        )}
      </header>
      {scanMsg && <p className="hub-refresh-msg">{scanMsg}</p>}

      {/* Stat cards */}
      <div className="stats-row hub-stats" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        {statCards.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-top"><span className="stat-label">{s.label}</span></div>
            <div className="stat-bottom"><span className="stat-num">{s.value}</span></div>
          </div>
        ))}
      </div>

      <div className="hub-grid">
        {/* Main column */}
        <div className="hub-main">
          <section className="card hub-card">
            <h3 className="hub-h3" style={{ marginTop: 0 }}>Signal volume · last 12 weeks</h3>
            <LineChart points={trend} ariaLabel={`Weekly signals for ${keyword.keyword}`} formatValue={(n) => String(Math.round(n))} />
          </section>

          {/* Leads */}
          <section className="card hub-card">
            <div className="hub-insight-head" style={{ marginBottom: 4 }}>
              <Icon name="Target01Icon" size={15} stroke={1.7} color="var(--accent)" />
              <span>Conversations · Reddit &amp; Hacker News</span>
            </div>
            {activeLeads.length === 0 ? (
              <p className="hub-empty-sub" style={{ padding: "8px 0" }}>
                No conversations yet. Issuefy looks for posts about &ldquo;{keyword.keyword}&rdquo; where recommending your product would be natural{canEdit ? " — or click Find conversations now." : "."}
              </p>
            ) : (
              <div className="lead-list">
                {activeLeads.map((l) => <LeadCard key={l.id} projectId={projectId} lead={l} />)}
              </div>
            )}
          </section>
        </div>

        {/* Rail */}
        <aside className="hub-rail">
          {categories.length > 0 && (
            <section className="card hub-card">
              <h3 className="hub-h3" style={{ marginTop: 0 }}>Signal categories</h3>
              <div className="kw-cats">
                {categories.map((c) => (
                  <div className="kw-cat" key={c.category}>
                    <span className="kw-cat-label">{c.category}</span>
                    <span className="kw-cat-bar"><span className="kw-cat-fill" style={{ width: `${(c.count / maxCat) * 100}%` }} /></span>
                    <span className="kw-cat-n">{c.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="card hub-card">
            <h3 className="hub-h3" style={{ marginTop: 0 }}>Recent signals</h3>
            {signals.length === 0 ? (
              <p className="hub-empty-sub">No signals tied to this keyword yet.</p>
            ) : (
              <div className="hub-signals">
                {signals.map((s) => (
                  <Link key={s.id} href={`/dashboard/${projectId}#sig-${s.id}`} className="hub-signal">
                    <span className={"hub-sig-dot imp-" + s.importance.toLowerCase()} />
                    <span className="hub-sig-meta">
                      <span className="hub-sig-title">{s.title}</span>
                      <span className="hub-sig-sub">{s.category} · {fmtAgo(s.created_at)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
