"use client";

import { useState } from "react";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { useDashboardRole, canManage } from "@/components/dashboard/dashboard-role-context";
import { fmtAgo, fmtCompact } from "@/lib/format";

/**
 * One discovered lead — shared by the keyword hub and the central Leads inbox.
 * Shows the post + why it's a lead, lets an editor draft a reply on demand,
 * and updates status (saved / dismissed / replied). Viewers see it read-only.
 */
export interface Lead {
  id: string;
  keyword_id: string;
  keyword?: string | null;        // set in the central inbox
  platform: "reddit" | "hackernews";
  post_url: string;
  post_title: string;
  post_excerpt: string | null;
  author: string | null;
  author_url: string | null;
  context: string;
  posted_at: string | null;
  engagement: number | null;
  lead_score: number;
  intent: string | null;
  reason: string | null;
  draft_reply: string | null;
  status: "new" | "saved" | "dismissed" | "replied";
}

const PLATFORM: Record<Lead["platform"], { label: string; icon: IconName }> = {
  reddit: { label: "Reddit", icon: "RedditIcon" },
  hackernews: { label: "Hacker News", icon: "Globe02Icon" },
};

const INTENT_LABEL: Record<string, string> = {
  seeking_recommendation: "Seeking a recommendation",
  frustrated_with_tool: "Frustrated with current tool",
  asking_how_to: "Asking how-to",
  comparing_options: "Comparing options",
  researching: "Researching",
};

export function LeadCard({ projectId, lead }: { projectId: string; lead: Lead }) {
  const role = useDashboardRole();
  const canEdit = canManage(role);
  const [status, setStatus] = useState<Lead["status"]>(lead.status);
  const [reply, setReply] = useState<string | null>(lead.draft_reply);
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const plat = PLATFORM[lead.platform];

  async function draft() {
    setErr(null);
    setDrafting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/leads/${lead.id}/draft-reply`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(body.error || "Couldn't draft a reply — try again."); return; }
      setReply(body.reply);
    } catch {
      setErr("Couldn't draft a reply — check your connection.");
    } finally {
      setDrafting(false);
    }
  }

  async function setLeadStatus(next: Lead["status"]) {
    const prev = status;
    setStatus(next); // optimistic
    try {
      const res = await fetch(`/api/projects/${projectId}/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) setStatus(prev);
    } catch {
      setStatus(prev);
    }
  }

  async function copyReply() {
    if (!reply) return;
    try {
      await navigator.clipboard.writeText(reply);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch { /* clipboard blocked — user can select manually */ }
  }

  if (status === "dismissed") {
    return (
      <div className="lead-card lead-dismissed">
        <span className="lead-dismissed-tx">Dismissed — {lead.post_title}</span>
        {canEdit && <button className="btn btn-quiet btn-sm" onClick={() => setLeadStatus("new")}>Undo</button>}
      </div>
    );
  }

  return (
    <div className={"lead-card" + (status === "replied" ? " lead-replied" : "")}>
      <div className="lead-top">
        <span className="lead-plat"><Icon name={plat.icon} size={14} stroke={1.7} /> {lead.context}</span>
        <span className="lead-score" title="Relevance — how naturally you could recommend your product here">{lead.lead_score}</span>
      </div>

      <a href={lead.post_url} target="_blank" rel="noopener noreferrer" className="lead-title">
        {lead.post_title}<Icon name="ArrowUpRight01Icon" size={13} stroke={1.8} />
      </a>

      {lead.post_excerpt && <p className="lead-excerpt">{lead.post_excerpt}</p>}

      <div className="lead-meta">
        {lead.intent && <span className="lead-intent">{INTENT_LABEL[lead.intent] || lead.intent}</span>}
        {lead.keyword && <span className="lead-kw">#{lead.keyword}</span>}
        {lead.author && (
          <span className="lead-author">
            {lead.author_url
              ? <a href={lead.author_url} target="_blank" rel="noopener noreferrer">u/{lead.author}</a>
              : `by ${lead.author}`}
          </span>
        )}
        {lead.engagement !== null && <span className="lead-eng">▲ {fmtCompact(lead.engagement)}</span>}
        <span className="lead-age">{fmtAgo(lead.posted_at)}</span>
      </div>

      {lead.reason && <p className="lead-reason"><Icon name="SparklesIcon" size={12} stroke={1.7} /> {lead.reason}</p>}

      {reply && (
        <div className="lead-reply">
          <div className="lead-reply-head">
            <span>Suggested reply</span>
            <button className="btn btn-quiet btn-sm" onClick={copyReply}>{copied ? "Copied ✓" : "Copy"}</button>
          </div>
          <p>{reply}</p>
        </div>
      )}
      {err && <p className="lead-err">{err}</p>}

      {canEdit && (
        <div className="lead-actions">
          <button className="btn btn-ghost btn-sm" onClick={draft} disabled={drafting}>
            <Icon name={drafting ? "Loading03Icon" : "AiMagicIcon"} size={14} stroke={1.8} className={drafting ? "spin" : ""} />
            {reply ? (drafting ? "Rewriting…" : "Redraft") : (drafting ? "Writing…" : "Draft recommendation")}
          </button>
          <span className="lead-action-spacer" />
          <button className={"btn btn-quiet btn-sm" + (status === "saved" ? " on" : "")} onClick={() => setLeadStatus(status === "saved" ? "new" : "saved")}>
            <Icon name="Bookmark01Icon" size={14} stroke={1.8} /> {status === "saved" ? "Saved" : "Save"}
          </button>
          <button className={"btn btn-quiet btn-sm" + (status === "replied" ? " on" : "")} onClick={() => setLeadStatus(status === "replied" ? "new" : "replied")}>
            <Icon name="Tick02Icon" size={14} stroke={1.8} /> {status === "replied" ? "Replied" : "Mark replied"}
          </button>
          <button className="btn btn-quiet btn-sm" onClick={() => setLeadStatus("dismissed")} title="Dismiss">
            <Icon name="Cancel01Icon" size={14} stroke={1.8} />
          </button>
        </div>
      )}
    </div>
  );
}
