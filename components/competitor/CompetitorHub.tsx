"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons/Icon";
import type { IconName } from "@/components/icons/registry";
import { LineChart } from "@/components/charts/LineChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { BarChart, type Bar } from "@/components/charts/BarChart";
import { useDashboardRole, canManage } from "@/components/dashboard/dashboard-role-context";
import { fmtAgo, fmtCompact } from "@/lib/format";

/**
 * Competitor Hub — the full per-competitor profile view.
 *
 * Sections: identity header (+ refresh), all-platform stat cards, Instagram
 * deep-dive (follower LineChart + engagement BarChart + post grid), AI
 * insight card, and a rail with platform stat cards + recent signals.
 *
 * All data arrives serialized from the server page; the only client fetch is
 * the manual refresh POST. Viewers get a read-only page (no refresh button) —
 * the server route enforces the same boundary.
 */

export interface HubCompetitor {
  id: string;
  name: string;
  website_url: string;
  description: string | null;
  logo_url: string | null;
  socials: Partial<Record<string, string>> | null;
  is_active: boolean;
}
export interface HubProfile {
  id: string;
  platform: "instagram" | "youtube" | "reddit" | "linkedin" | "tiktok" | "facebook";
  handle: string;
  url: string;
  full_name: string | null;
  biography: string | null;
  profile_pic_url: string | null;
  is_verified: boolean | null;
  followers: number | null;
  following: number | null;
  posts_count: number | null;
  external_url: string | null;
  last_fetched_at: string | null;
  fetch_status: "pending" | "ok" | "failed" | "link_only";
  fetch_error: string | null;
}
export interface HubSnapshot {
  profile_id: string;
  captured_on: string;            // yyyy-mm-dd
  followers: number | null;
  engagement_rate: number | null;
}
export interface HubPost {
  id: string;
  url: string;
  post_type: string | null;
  caption: string | null;
  display_url: string | null;
  likes: number | null;
  comments: number | null;
  video_views: number | null;
  posted_at: string | null;
}
export interface HubInsight {
  insight_text: string;
  highlights: { label: string; detail: string }[] | null;
  model_used: string | null;
  updated_at: string;
}
export interface HubSignal {
  id: string;
  title: string;
  category: string;
  importance: "Low" | "Medium" | "High";
  created_at: string;
}

const PLATFORM_META: Record<HubProfile["platform"], { label: string; icon: IconName; noun: string }> = {
  instagram: { label: "Instagram", icon: "InstagramIcon", noun: "followers" },
  youtube:   { label: "YouTube",   icon: "YoutubeIcon",   noun: "subscribers" },
  reddit:    { label: "Reddit",    icon: "RedditIcon",    noun: "members" },
  linkedin:  { label: "LinkedIn",  icon: "Linkedin01Icon", noun: "followers" },
  tiktok:    { label: "TikTok",    icon: "TiktokIcon",    noun: "followers" },
  facebook:  { label: "Facebook",  icon: "Facebook01Icon", noun: "followers" },
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Stored social links are user/enrichment input — some lack a protocol,
 *  which the browser would treat as a relative path. */
function ext(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

/** Latest follower value vs the closest snapshot ≥6 days older — the same
 *  week-over-week definition the signal emitter uses. */
function weekDelta(snaps: HubSnapshot[]): { delta: number; pct: number } | null {
  const withF = snaps.filter((s) => s.followers !== null);
  if (withF.length < 2) return null;
  const latest = withF[withF.length - 1];
  const latestDate = new Date(latest.captured_on + "T00:00:00Z").getTime();
  const baseline = [...withF].reverse().find(
    (s) => latestDate - new Date(s.captured_on + "T00:00:00Z").getTime() >= 6 * 86_400_000,
  );
  if (!baseline || !baseline.followers) return null;
  const delta = (latest.followers as number) - baseline.followers;
  return { delta, pct: (delta / baseline.followers) * 100 };
}

export default function CompetitorHub({
  projectId, competitor, profiles, snapshots, posts, insight, signals,
}: {
  projectId: string;
  competitor: HubCompetitor;
  profiles: HubProfile[];
  snapshots: HubSnapshot[];
  posts: HubPost[];
  insight: HubInsight | null;
  signals: HubSignal[];
}) {
  const router = useRouter();
  const role = useDashboardRole();
  const canEdit = canManage(role);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);

  const ig = profiles.find((p) => p.platform === "instagram");
  const snapsFor = useMemo(() => {
    const map = new Map<string, HubSnapshot[]>();
    for (const s of snapshots) {
      const arr = map.get(s.profile_id) ?? [];
      arr.push(s);
      map.set(s.profile_id, arr);
    }
    return map;
  }, [snapshots]);

  const igSnaps = ig ? (snapsFor.get(ig.id) ?? []) : [];
  const igLine = igSnaps
    .filter((s) => s.followers !== null)
    .map((s) => ({ date: s.captured_on, value: s.followers as number }));
  const igEngagement = igSnaps.length ? igSnaps[igSnaps.length - 1].engagement_rate : null;

  // Engagement bars — posts ascending by date so the x axis reads left→right.
  const bars: Bar[] = useMemo(() => {
    const sorted = [...posts]
      .filter((p) => p.posted_at)
      .sort((a, b) => (a.posted_at! < b.posted_at! ? -1 : 1));
    return sorted.map((p) => ({
      label: shortDate(p.posted_at),
      value: (p.likes ?? 0) + (p.comments ?? 0),
      href: p.url,
      tooltip: [
        `${fmtCompact((p.likes ?? 0) + (p.comments ?? 0))} engagement`,
        `${fmtCompact(p.likes ?? 0)} likes · ${fmtCompact(p.comments ?? 0)} comments`,
        ...(p.video_views ? [`${fmtCompact(p.video_views)} video views`] : []),
      ],
    }));
  }, [posts]);

  // Stat cards — one per fetched platform with data, plus IG engagement rate.
  const stats: { label: string; value: string; delta?: { delta: number; pct: number } | null }[] = [];
  for (const p of profiles) {
    if (p.fetch_status !== "ok" || p.followers === null) continue;
    const meta = PLATFORM_META[p.platform];
    stats.push({
      label: `${meta.label} ${meta.noun}`,
      value: fmtCompact(p.followers),
      delta: weekDelta(snapsFor.get(p.id) ?? []),
    });
  }
  if (igEngagement !== null && igEngagement !== undefined) {
    stats.push({ label: "IG engagement rate", value: `${Number(igEngagement).toFixed(2)}%` });
  }

  const monitorable = profiles.filter((p) => p.fetch_status !== "link_only");
  const linkOnly = profiles.filter((p) => p.fetch_status === "link_only");
  const railPlatforms = profiles.filter((p) => p.platform !== "instagram" && p.fetch_status !== "link_only");

  async function runRefresh() {
    setRefreshMsg(null);
    setRefreshing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/competitors/${competitor.id}/social-refresh`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setRefreshMsg(body.error || "Social data refreshes once per hour per competitor.");
        return;
      }
      if (!res.ok) {
        setRefreshMsg(body.error || "Refresh failed — try again in a bit.");
        return;
      }
      router.refresh();
    } catch {
      setRefreshMsg("Refresh failed — check your connection and try again.");
    } finally {
      setRefreshing(false);
    }
  }

  const initials = competitor.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="page-wrap hub">
      {/* ── Header ── */}
      <header className="hub-head">
        <div className="hub-id">
          <span className="hub-logo">
            {competitor.logo_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={competitor.logo_url} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              : null}
            <span className="hub-logo-fallback">{initials}</span>
          </span>
          <div className="hub-id-meta">
            <h1 className="hub-name">{competitor.name}</h1>
            <div className="hub-sub">
              <a href={competitor.website_url.startsWith("http") ? competitor.website_url : `https://${competitor.website_url}`}
                target="_blank" rel="noopener noreferrer" className="hub-site">
                {competitor.website_url.replace(/^https?:\/\/(www\.)?/, "")}
                <Icon name="ArrowUpRight01Icon" size={12} stroke={1.8} />
              </a>
              {competitor.description && <span className="hub-desc">{competitor.description}</span>}
            </div>
            <div className="hub-chips">
              {profiles.map((p) => (
                <a key={p.id} href={ext(p.url)} target="_blank" rel="noopener noreferrer" className="hub-chip">
                  <Icon name={PLATFORM_META[p.platform].icon} size={13} stroke={1.7} />
                  {PLATFORM_META[p.platform].label}
                </a>
              ))}
            </div>
          </div>
        </div>
        {canEdit && monitorable.length > 0 && (
          <div className="hub-actions">
            <button className="btn btn-ghost" onClick={runRefresh} disabled={refreshing}>
              <Icon name="RefreshIcon" size={15} stroke={1.7} className={refreshing ? "spin" : ""} />
              {refreshing ? "Refreshing…" : "Refresh social data"}
            </button>
          </div>
        )}
      </header>
      {refreshMsg && <p className="hub-refresh-msg">{refreshMsg}</p>}

      {/* ── Nothing monitored at all ── */}
      {profiles.length === 0 && (
        <section className="card hub-empty">
          <Icon name="Globe02Icon" size={26} stroke={1.5} />
          <p>No social accounts linked for {competitor.name} yet.</p>
          <p className="hub-empty-sub">Add their Instagram, YouTube, LinkedIn or Reddit in project settings and Issuefy starts tracking stats the next morning.</p>
          <Link href={`/dashboard/${projectId}/settings`} className="btn btn-accent btn-sm">Open settings</Link>
        </section>
      )}

      {/* ── Stat cards ── */}
      {stats.length > 0 && (
        <div className="stats-row hub-stats" style={{ gridTemplateColumns: `repeat(${Math.min(stats.length, 4)}, 1fr)` }}>
          {stats.map((s) => (
            <div className="stat" key={s.label}>
              <div className="stat-top"><span className="stat-label">{s.label}</span></div>
              <div className="stat-bottom">
                <span className="stat-num">{s.value}</span>
                {s.delta && (
                  <span className="stat-delta" style={{ color: s.delta.delta >= 0 ? "var(--pos)" : "var(--neg)" }}>
                    <Icon name={s.delta.delta >= 0 ? "ArrowUp01Icon" : "ArrowDown01Icon"} size={12} stroke={2} />
                    {Math.abs(s.delta.pct).toFixed(1)}% / wk
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {profiles.length > 0 && (
        <div className="hub-grid">
          {/* ── Main column ── */}
          <div className="hub-main">
            {/* No Instagram linked — keep the main column purposeful instead
                of hollow, and point at the unlock. */}
            {!ig && (
              <section className="card hub-card hub-ig-missing">
                <span className="hub-ig-missing-ic"><Icon name="InstagramIcon" size={20} stroke={1.5} /></span>
                <div className="hub-ig-missing-tx">
                  <span>Instagram isn&apos;t linked for {competitor.name}.</span>
                  <span className="hub-empty-sub">Add their Instagram in settings to unlock follower graphs, recent posts and richer AI insights here.</span>
                </div>
                <Link href={`/dashboard/${projectId}/settings`} className="btn btn-ghost btn-sm">Add Instagram</Link>
              </section>
            )}
            {/* Instagram deep-dive */}
            {ig && (
              <section className="card hub-card">
                <div className="hub-ig-head">
                  {ig.profile_pic_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={ig.profile_pic_url} alt="" className="hub-avatar" referrerPolicy="no-referrer"
                        onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                    : <span className="hub-avatar hub-avatar-fallback"><Icon name="InstagramIcon" size={18} stroke={1.6} /></span>}
                  <div className="hub-ig-meta">
                    <span className="hub-ig-handle">
                      @{ig.handle}
                      {ig.is_verified && <Icon name="CheckmarkBadge01Icon" size={14} stroke={1.8} color="var(--accent)" />}
                    </span>
                    {ig.biography && <span className="hub-bio">{ig.biography}</span>}
                    <span className="hub-fetch-note">
                      {ig.fetch_status === "ok"
                        ? `Instagram · updated ${fmtAgo(ig.last_fetched_at)}`
                        : ig.fetch_status === "failed"
                          ? `Couldn't fetch: ${ig.fetch_error || "unknown error"}`
                          : "First snapshot pending — runs each morning."}
                    </span>
                  </div>
                  {ig.following !== null && (
                    <div className="hub-ig-side mono">
                      {fmtCompact(ig.following)} following · {fmtCompact(ig.posts_count)} posts
                    </div>
                  )}
                </div>

                <h3 className="hub-h3">Follower growth</h3>
                <LineChart points={igLine} ariaLabel={`${competitor.name} Instagram follower growth`} />

                <h3 className="hub-h3">Engagement per post</h3>
                <BarChart bars={bars} ariaLabel={`${competitor.name} engagement per Instagram post`} />

                {posts.length > 0 && (
                  <>
                    <h3 className="hub-h3">Recent posts</h3>
                    <div className="hub-posts">
                      {posts.map((p) => <PostCard key={p.id} post={p} />)}
                    </div>
                  </>
                )}
              </section>
            )}

            {/* AI insight */}
            {insight && (
              <section className="card hub-card hub-insight">
                <div className="hub-insight-head">
                  <Icon name="SparklesIcon" size={15} stroke={1.7} color="var(--accent)" />
                  <span>AI read on {competitor.name}&apos;s social presence</span>
                </div>
                <p className="hub-insight-text">{insight.insight_text}</p>
                {Array.isArray(insight.highlights) && insight.highlights.length > 0 && (
                  <div className="hub-insight-hl">
                    {insight.highlights.map((h, i) => (
                      <div className="hub-hl" key={i}>
                        <span className="hub-hl-label">{h.label}</span>
                        <span className="hub-hl-detail">{h.detail}</span>
                      </div>
                    ))}
                  </div>
                )}
                <span className="hub-foot-note">Generated {fmtAgo(insight.updated_at)}{insight.model_used ? ` · ${insight.model_used}` : ""}</span>
              </section>
            )}
          </div>

          {/* ── Rail ── */}
          <aside className="hub-rail">
            {railPlatforms.length > 0 && (
              <section className="card hub-card">
                <h3 className="hub-h3" style={{ marginTop: 0 }}>Other platforms</h3>
                <div className="hub-plats">
                  {railPlatforms.map((p) => {
                    const meta = PLATFORM_META[p.platform];
                    const series = (snapsFor.get(p.id) ?? [])
                      .filter((s) => s.followers !== null)
                      .slice(-30)
                      .map((s) => s.followers as number);
                    return (
                      <a key={p.id} href={ext(p.url)} target="_blank" rel="noopener noreferrer" className="hub-plat">
                        <span className="hub-plat-ic"><Icon name={meta.icon} size={17} stroke={1.6} /></span>
                        <span className="hub-plat-meta">
                          <span className="hub-plat-name">{meta.label}</span>
                          <span className="hub-plat-count">
                            {p.fetch_status === "ok" && p.followers !== null
                              ? `${fmtCompact(p.followers)} ${meta.noun}`
                              : p.fetch_status === "failed" ? "— no data" : "pending"}
                          </span>
                        </span>
                        <Sparkline values={series} />
                      </a>
                    );
                  })}
                </div>
                {railPlatforms.some((p) => p.platform === "linkedin") && (
                  <span className="hub-foot-note">LinkedIn numbers come from the weekly scan.</span>
                )}
              </section>
            )}

            {linkOnly.length > 0 && (
              <section className="card hub-card">
                <h3 className="hub-h3" style={{ marginTop: 0 }}>Also on</h3>
                <div className="hub-chips">
                  {linkOnly.map((p) => (
                    <a key={p.id} href={ext(p.url)} target="_blank" rel="noopener noreferrer" className="hub-chip">
                      <Icon name={PLATFORM_META[p.platform].icon} size={13} stroke={1.7} />
                      {PLATFORM_META[p.platform].label}
                    </a>
                  ))}
                </div>
              </section>
            )}

            {signals.length > 0 && (
              <section className="card hub-card">
                <h3 className="hub-h3" style={{ marginTop: 0 }}>Recent signals</h3>
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
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/** Post card with a graceful thumbnail fallback — IG CDN URLs are signed and
 *  expire; daily refresh keeps them young, but a broken one collapses into a
 *  branded placeholder instead of the browser's broken-image glyph. */
function PostCard({ post }: { post: HubPost }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImg = post.display_url && !imgFailed;
  return (
    <a href={post.url} target="_blank" rel="noopener noreferrer" className="hub-post">
      <span className="hub-post-thumb">
        {showImg
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={post.display_url as string} alt="" loading="lazy" referrerPolicy="no-referrer"
              onError={() => setImgFailed(true)} />
          : <Icon name={post.post_type === "Video" ? "PlayIcon" : "InstagramIcon"} size={22} stroke={1.5} />}
        {post.post_type && <span className="hub-post-type">{post.post_type}</span>}
      </span>
      <span className="hub-post-body">
        <span className="hub-post-cap">{post.caption || "(no caption)"}</span>
        <span className="hub-post-meta">
          <span>♥ {fmtCompact(post.likes ?? 0)}</span>
          <span>💬 {fmtCompact(post.comments ?? 0)}</span>
          {post.video_views ? <span>▶ {fmtCompact(post.video_views)}</span> : null}
          <span style={{ marginLeft: "auto" }}>{shortDate(post.posted_at)}</span>
        </span>
      </span>
    </a>
  );
}
