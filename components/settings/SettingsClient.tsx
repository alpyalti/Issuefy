"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import { ErrorState, ERROR_MESSAGES } from "@/components/ui/ErrorState";

interface Project {
  id: string;
  name: string;
  company_name: string | null;
  company_website: string | null;
  company_description: string | null;
  company_socials: Record<string, string> | null;
  track_company: boolean;
  industry: string;
  business_type: string;
  target_market: string;
  is_active: boolean;
}

interface Competitor {
  id: string;
  name: string;
  website_url: string;
  description: string | null;
  is_active: boolean;
  socials?: Record<string, string> | null;
}
interface Keyword { id: string; keyword: string; is_active: boolean; last_discovered_at: string | null; }

export default function SettingsClient({
  project, competitors: initialCompetitors, keywords: initialKeywords, competitorCap, keywordCap,
}: {
  project: Project;
  competitors: Competitor[];
  keywords: Keyword[];
  competitorCap: number;
  keywordCap: number;
}) {
  const router = useRouter();
  const [competitors, setCompetitors] = useState(initialCompetitors);
  const [keywords, setKeywords] = useState(initialKeywords);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTx] = useTransition();
  const [newCompetitorUrl, setNewCompetitorUrl] = useState("");
  const [newKeyword, setNewKeyword] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  // ── Project fields (PATCH /api/projects/:id) ──────────────────────────
  const [name, setName] = useState(project.name);
  const [industry, setIndustry] = useState(project.industry);
  const [targetMarket, setTargetMarket] = useState(project.target_market);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  async function saveProject() {
    setSaveStatus("saving");
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, industry, target_market: targetMarket }),
      });
      if (!res.ok) throw new Error("save failed");
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1_500);
      router.refresh();
    } catch {
      setSaveStatus("idle");
      setErr("Couldn't save your changes — try again.");
    }
  }

  // ── Competitor add / toggle / remove ──────────────────────────────────
  async function addCompetitor() {
    if (!newCompetitorUrl.trim()) return;
    if (competitors.length >= competitorCap) {
      setErr(`Your plan allows ${competitorCap} competitor${competitorCap === 1 ? "" : "s"} per project. Remove one or upgrade.`);
      return;
    }
    startTx(async () => {
      const res = await fetch(`/api/projects/${project.id}/competitors`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ website_url: newCompetitorUrl.trim() }),
      });
      if (res.status === 409) {
        const { error } = await res.json().catch(() => ({ error: ERROR_MESSAGES.PLAN_LIMIT }));
        setErr(error);
        return;
      }
      if (!res.ok) { setErr("Couldn't add that competitor."); return; }
      const { competitor } = await res.json();
      setCompetitors((prev) => [...prev, competitor]);
      setNewCompetitorUrl("");
      router.refresh();
    });
  }
  async function toggleCompetitor(c: Competitor) {
    setCompetitors((prev) => prev.map((x) => (x.id === c.id ? { ...x, is_active: !x.is_active } : x)));
    await fetch(`/api/competitors/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: !c.is_active }),
    });
  }
  async function removeCompetitor(c: Competitor) {
    setCompetitors((prev) => prev.filter((x) => x.id !== c.id));
    await fetch(`/api/competitors/${c.id}`, { method: "DELETE" });
    router.refresh();
  }
  async function saveCompetitorSocials(c: Competitor, socials: Record<string, string>) {
    setCompetitors((prev) => prev.map((x) => (x.id === c.id ? { ...x, socials } : x)));
    const res = await fetch(`/api/competitors/${c.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ socials }),
    });
    if (!res.ok) setErr("Couldn't save those social links.");
  }

  // ── Keyword add / toggle / remove ─────────────────────────────────────
  async function addKeyword() {
    if (!newKeyword.trim()) return;
    if (keywords.length >= keywordCap) {
      setErr(`Your plan allows ${keywordCap} keywords per project. Remove one or upgrade.`);
      return;
    }
    startTx(async () => {
      const res = await fetch(`/api/projects/${project.id}/keywords`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ keyword: newKeyword.trim() }),
      });
      if (res.status === 409) {
        const { error } = await res.json().catch(() => ({ error: ERROR_MESSAGES.PLAN_LIMIT }));
        setErr(error);
        return;
      }
      if (!res.ok) { setErr("Couldn't add that keyword."); return; }
      const { keyword } = await res.json();
      setKeywords((prev) => [...prev, keyword]);
      setNewKeyword("");
      router.refresh();
    });
  }
  async function toggleKeyword(k: Keyword) {
    setKeywords((prev) => prev.map((x) => (x.id === k.id ? { ...x, is_active: !x.is_active } : x)));
    await fetch(`/api/keywords/${k.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: !k.is_active }),
    });
  }
  async function removeKeyword(k: Keyword) {
    setKeywords((prev) => prev.filter((x) => x.id !== k.id));
    await fetch(`/api/keywords/${k.id}`, { method: "DELETE" });
    router.refresh();
  }

  // ── Pause / resume project ────────────────────────────────────────────
  const [isActive, setIsActive] = useState(project.is_active);
  async function togglePause() {
    const next = !isActive;
    setIsActive(next);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    });
    if (!res.ok) setIsActive(!next);
    else router.refresh();
  }

  // ── Delete project ────────────────────────────────────────────────────
  async function deleteProject() {
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {err && <ErrorState message={err} onRetry={() => setErr(null)} retryLabel="Dismiss" />}

      {/* Project details */}
      <section className="card" style={{ padding: 22 }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, marginBottom: 14 }}>Project details</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={labelStyle}>Project name</label>
            <input className="modal-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>Industry</label>
            <input className="modal-input" value={industry} onChange={(e) => setIndustry(e.target.value)} />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label style={labelStyle}>Target market</label>
            <input className="modal-input" value={targetMarket} onChange={(e) => setTargetMarket(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
          {saveStatus === "saved" && <span className="mono" style={{ fontSize: 12, color: "var(--pos)" }}>✓ Saved</span>}
          <button className="btn btn-accent" onClick={saveProject} disabled={saveStatus === "saving"}>
            {saveStatus === "saving" ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>

      {/* Competitors */}
      <section className="card" style={{ padding: 22 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Competitors</h2>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
            {competitors.length} / {competitorCap}
          </span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {competitors.length === 0 && (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)" }}>No competitors yet — add one below.</p>
          )}
          {competitors.map((c) => (
            <CompetitorRow
              key={c.id}
              competitor={c}
              onToggle={() => toggleCompetitor(c)}
              onRemove={() => removeCompetitor(c)}
              onSaveSocials={(socials) => saveCompetitorSocials(c, socials)}
            />
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input className="modal-input" placeholder="newcompetitor.com" value={newCompetitorUrl} onChange={(e) => setNewCompetitorUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCompetitor(); }} />
          <button className="btn btn-accent" onClick={addCompetitor} disabled={pending || !newCompetitorUrl.trim() || competitors.length >= competitorCap}>
            {pending ? "Adding…" : "Add competitor"}
          </button>
        </div>
      </section>

      {/* Keywords */}
      <section className="card" style={{ padding: 22 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>Keywords</h2>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>
            {keywords.length} / {keywordCap}
          </span>
        </header>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {keywords.length === 0 && (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)" }}>No keywords yet — add one below.</p>
          )}
          {keywords.map((k) => (
            <div key={k.id} className="watch-item" style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, opacity: k.is_active ? 1 : 0.55 }}>
              <span className={"watch-live " + (k.is_active ? "on" : "")} />
              <span className="watch-label" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span>{k.keyword}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>
                  {k.last_discovered_at ? `Last discovered ${new Date(k.last_discovered_at).toLocaleDateString()}` : "Awaiting first discovery"}
                </span>
              </span>
              <button className="icon-btn" title={k.is_active ? "Pause" : "Resume"} onClick={() => toggleKeyword(k)}>
                <Icon name={k.is_active ? "Tick02Icon" : "PlusSignIcon"} size={15} stroke={1.8} />
              </button>
              <button className="watch-del" style={{ opacity: 1 }} onClick={() => removeKeyword(k)} title="Remove">
                <Icon name="Delete02Icon" size={14} stroke={1.8} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input className="modal-input" placeholder="e.g. usage-based pricing" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addKeyword(); }} />
          <button className="btn btn-accent" onClick={addKeyword} disabled={pending || !newKeyword.trim() || keywords.length >= keywordCap}>
            {pending ? "Adding…" : "Add keyword"}
          </button>
        </div>
      </section>

      {/* Pause / Resume */}
      <section className="card" style={{ padding: 22, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 18 }}>{isActive ? "Project is active" : "Project is paused"}</h2>
          <p className="muted" style={{ fontSize: 13.5, maxWidth: 480 }}>
            {isActive
              ? "Issuefy scans this project every morning. Pause it to stop the daily scan without deleting any data."
              : "The daily cron skips this project. Existing signals + sources remain visible. Resume any time to start scanning again."}
          </p>
        </div>
        <button
          className={"btn " + (isActive ? "btn-ghost" : "btn-accent")}
          onClick={togglePause}
        >
          <Icon name={isActive ? "Bookmark01Icon" : "RefreshIcon"} size={15} stroke={1.8} />
          {isActive ? "Pause project" : "Resume project"}
        </button>
      </section>

      {/* Danger zone */}
      <section className="card" style={{ padding: 22, borderColor: "var(--neg-line)" }}>
        <h2 style={{ fontFamily: "var(--serif)", fontSize: 18, color: "var(--neg)", marginBottom: 8 }}>Danger zone</h2>
        <p className="muted" style={{ fontSize: 13.5 }}>
          Deleting a project removes its competitors, keywords, sources, signals and daily summaries — permanently.
        </p>
        {!deleteOpen ? (
          <button className="btn btn-ghost" style={{ marginTop: 12, color: "var(--neg)", borderColor: "var(--neg-line)" }} onClick={() => setDeleteOpen(true)}>
            Delete project…
          </button>
        ) : (
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>Cancel</button>
            <button className="btn btn-accent" style={{ background: "var(--neg)" }} onClick={deleteProject}>
              Yes, delete &quot;{project.name}&quot;
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--mono)",
  fontSize: 10.5,
  color: "var(--ink-3)",
  letterSpacing: ".08em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 6,
};

/* ───────────── Competitor row with collapsible socials editor ───────────── */

const SOCIAL_PLATFORMS: { key: string; label: string; icon: "Globe02Icon" | "Linkedin01Icon" | "NewTwitterIcon" | "InstagramIcon" | "Facebook01Icon" | "YoutubeIcon" | "TiktokIcon" | "RedditIcon"; placeholder: string }[] = [
  { key: "website", label: "Website", icon: "Globe02Icon", placeholder: "https://example.com" },
  { key: "linkedin", label: "LinkedIn", icon: "Linkedin01Icon", placeholder: "linkedin.com/company/example" },
  { key: "x", label: "X (Twitter)", icon: "NewTwitterIcon", placeholder: "x.com/example" },
  { key: "instagram", label: "Instagram", icon: "InstagramIcon", placeholder: "instagram.com/example" },
  { key: "facebook", label: "Facebook", icon: "Facebook01Icon", placeholder: "facebook.com/example" },
  { key: "youtube", label: "YouTube", icon: "YoutubeIcon", placeholder: "youtube.com/@example" },
  { key: "tiktok", label: "TikTok", icon: "TiktokIcon", placeholder: "tiktok.com/@example" },
  { key: "reddit", label: "Reddit", icon: "RedditIcon", placeholder: "reddit.com/r/example" },
];

function CompetitorRow({
  competitor, onToggle, onRemove, onSaveSocials,
}: {
  competitor: Competitor;
  onToggle: () => void;
  onRemove: () => void;
  onSaveSocials: (socials: Record<string, string>) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() => ({ ...(competitor.socials || {}) }));
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Reset draft whenever the competitor's socials change from outside.
  useEffect(() => { setDraft({ ...(competitor.socials || {}) }); }, [competitor.socials]);

  async function save() {
    setSaveStatus("saving");
    // Strip empty strings — let the user clear a field by emptying it.
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(draft)) {
      const trimmed = (v || "").trim();
      if (trimmed) clean[k] = trimmed;
    }
    await onSaveSocials(clean);
    setSaveStatus("saved");
    setTimeout(() => setSaveStatus("idle"), 1_400);
  }

  const filledCount = Object.values(draft).filter((v) => v && v.trim()).length;

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, opacity: competitor.is_active ? 1 : 0.55, overflow: "hidden" }}>
      <div className="watch-item" style={{ padding: "10px 12px", borderRadius: 0 }}>
        <span className={"watch-live " + (competitor.is_active ? "on" : "")} />
        <span className="watch-label" style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <span>{competitor.name}</span>
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{competitor.website_url}</span>
        </span>
        <button
          className="icon-btn"
          title={open ? "Hide socials" : "Edit socials"}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
        >
          <Icon name={open ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={15} stroke={1.8} />
          {filledCount > 0 && (
            <span style={{ marginLeft: 4, fontFamily: "var(--mono)", fontSize: 10, color: "var(--ink-3)" }}>{filledCount}</span>
          )}
        </button>
        <button className="icon-btn" title={competitor.is_active ? "Pause" : "Resume"} onClick={onToggle}>
          <Icon name={competitor.is_active ? "Tick02Icon" : "PlusSignIcon"} size={15} stroke={1.8} />
        </button>
        <button className="watch-del" style={{ opacity: 1 }} onClick={onRemove} title="Remove">
          <Icon name="Delete02Icon" size={14} stroke={1.8} />
        </button>
      </div>
      {open && (
        <div style={{ padding: "12px 14px 14px", background: "var(--surface-2)", borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 4 }}>
            These links are saved on the competitor for your reference. Issuefy doesn&apos;t scrape social posts at this time — only the main website.
          </p>
          {SOCIAL_PLATFORMS.map((p) => (
            <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: "var(--surface)", border: "1px solid var(--line)", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink-2)", flex: "none" }}>
                <Icon name={p.icon} size={13} stroke={1.6} />
              </span>
              <span style={{ width: 88, fontSize: 12, fontWeight: 600, color: "var(--ink-2)", flex: "none" }}>{p.label}</span>
              <input
                value={draft[p.key] || ""}
                onChange={(e) => setDraft((d) => ({ ...d, [p.key]: e.target.value }))}
                placeholder={p.placeholder}
                style={{
                  flex: 1, minWidth: 0, height: 32, padding: "0 10px",
                  border: "1px solid var(--line-2)", borderRadius: 8, background: "var(--surface)",
                  fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", outline: "none",
                }}
              />
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            {saveStatus === "saved" && <span className="mono" style={{ fontSize: 12, color: "var(--pos)", alignSelf: "center" }}>✓ Saved</span>}
            <button className="btn btn-quiet btn-sm" onClick={() => setDraft({ ...(competitor.socials || {}) })} disabled={saveStatus === "saving"}>Reset</button>
            <button className="btn btn-accent btn-sm" onClick={save} disabled={saveStatus === "saving"}>{saveStatus === "saving" ? "Saving…" : "Save links"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
