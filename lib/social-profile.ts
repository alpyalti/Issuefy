/**
 * Competitor Hub orchestrator — refresh social profiles for one project.
 *
 * Tiering (locked in the plan):
 *   Instagram  rich tier via Apify (profile + latest 12 posts + snapshots)
 *   YouTube    stats tier — standard ScraperAPI fetch + subscriber parse
 *   Reddit     stats tier — free about.json
 *   LinkedIn   stats tier — parsed from the weekly premium scrape we ALREADY
 *              store in sources (zero new cost)
 *   TikTok/FB  link-only rows (never fetched)
 *
 * After capturing today's snapshots, notable week-over-week deltas (follower
 * spikes/drops, IG posting surges) are turned into signals through the
 * existing sources + signal_sources path so they reach the feed and the
 * daily brief. Finally, one OpenRouter call per updated competitor refreshes
 * the hub's AI insight.
 *
 * Called by:
 *   - app/api/internal/social-profiles (daily cron fan-out, one project per
 *     invocation)
 *   - app/api/projects/[id]/competitors/[competitorId]/social-refresh
 *     (manual refresh, hourly per-competitor cooldown)
 *
 * Everything fails soft per competitor/platform — one private IG account or
 * broken YouTube parse never blocks the rest of the project.
 */
import { z } from "zod";
import { requireSql, withTx } from "./db";
import { apifyEnabled, fetchInstagramProfiles, type IgProfileResult } from "./apify";
import {
  parseInstagramHandle,
  parseYouTubeSubscribers,
  fetchYouTubeSubscribersDirect,
  fetchRedditMembers,
  redditAboutUrl,
  parseRedditAbout,
  parseLinkedInFollowers,
} from "./social-stats";
import { standardScrape } from "./scraperapi";
import { cleanForStorage } from "./cleaner";
import { upsertSource } from "./sources";
import { chatJson } from "./openrouter";
import { reserveCalls } from "./usage-counters";
import { getLimits } from "./usage";
import { resolveMarket } from "./markets";
import { captureBreadcrumb, captureError } from "./sentry";

export type SocialPlatform = "instagram" | "youtube" | "reddit" | "linkedin" | "tiktok" | "facebook";

const FETCHED_PLATFORMS: SocialPlatform[] = ["instagram", "youtube", "reddit", "linkedin"];
const LINK_ONLY_PLATFORMS: SocialPlatform[] = ["tiktok", "facebook"];

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  youtube: "YouTube",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  facebook: "Facebook",
};

/** What each platform's `followers` column actually counts — for copy. */
const FOLLOWER_NOUN: Record<SocialPlatform, string> = {
  instagram: "followers",
  youtube: "subscribers",
  reddit: "members",
  linkedin: "followers",
  tiktok: "followers",
  facebook: "followers",
};

export interface RefreshTelemetry {
  profilesFetched: number;
  snapshotsWritten: number;
  signalsCreated: number;
  insightsRegenerated: number;
  errors: string[];
}

interface CompetitorRow {
  id: string;
  name: string;
  website_url: string;
  socials: Partial<Record<string, string>> | null;
}

interface ProjectRow {
  id: string;
  user_id: string;
  name: string;
  company_name: string | null;
  company_description: string | null;
  industry: string;
  business_type: string;
  target_market: string | null;
}

interface ProfileRow {
  id: string;
  competitor_id: string;
  platform: SocialPlatform;
  handle: string;
  url: string;
}

export async function refreshSocialProfiles(
  projectId: string,
  opts?: { onlyCompetitorId?: string },
): Promise<RefreshTelemetry> {
  const sql = requireSql();
  const t: RefreshTelemetry = {
    profilesFetched: 0, snapshotsWritten: 0, signalsCreated: 0, insightsRegenerated: 0, errors: [],
  };

  const projRows = (await sql`
    SELECT id, user_id, name, company_name, company_description,
           industry, business_type, target_market
    FROM projects WHERE id = ${projectId} AND is_active = true LIMIT 1
  `) as ProjectRow[];
  const project = projRows[0];
  if (!project) {
    t.errors.push("project not found or paused");
    return t;
  }

  const ownerRows = (await sql`SELECT plan, role FROM users WHERE id = ${project.user_id} LIMIT 1`) as { plan: string; role: string }[];
  const limits = getLimits(ownerRows[0]?.plan);
  // Admins skip the per-cycle social-fetch budget so they can hammer-test.
  const ownerIsAdmin = (ownerRows[0]?.role ?? "user") === "admin";

  const competitors = (await sql`
    SELECT id, name, website_url, socials
    FROM competitors
    WHERE project_id = ${projectId} AND is_active = true
      AND (${opts?.onlyCompetitorId ?? null}::uuid IS NULL OR id = ${opts?.onlyCompetitorId ?? null}::uuid)
  `) as CompetitorRow[];
  if (competitors.length === 0) return t;

  // ── Step 1: reconcile social_profiles rows with the current socials links ──
  // Handle/url are re-derived every run so a Settings edit takes effect on the
  // next refresh; rows for platforms whose link was removed get deleted.
  const updatedCompetitors = new Set<string>();
  for (const c of competitors) {
    const socials = c.socials ?? {};
    const linked: { platform: SocialPlatform; handle: string; url: string; linkOnly: boolean }[] = [];

    const ig = socials.instagram?.trim();
    if (ig) {
      const handle = parseInstagramHandle(ig);
      if (handle) {
        linked.push({ platform: "instagram", handle, url: `https://www.instagram.com/${handle}/`, linkOnly: false });
      }
    }
    const yt = socials.youtube?.trim();
    if (yt) linked.push({ platform: "youtube", handle: yt.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "").split(/[/?#]/)[0] || yt, url: yt, linkOnly: false });
    const rd = socials.reddit?.trim();
    if (rd) linked.push({ platform: "reddit", handle: rd.replace(/^https?:\/\/(www\.)?reddit\.com\//i, "").replace(/\/+$/, "") || rd, url: rd, linkOnly: false });
    const li = socials.linkedin?.trim();
    if (li) linked.push({ platform: "linkedin", handle: li.replace(/^https?:\/\/(www\.)?linkedin\.com\//i, "").replace(/\/+$/, "") || li, url: li, linkOnly: false });
    for (const p of LINK_ONLY_PLATFORMS) {
      const link = socials[p]?.trim();
      if (link) linked.push({ platform: p, handle: link, url: link, linkOnly: true });
    }

    for (const l of linked) {
      await sql`
        INSERT INTO social_profiles (competitor_id, platform, handle, url, fetch_status)
        VALUES (${c.id}, ${l.platform}, ${l.handle}, ${l.url}, ${l.linkOnly ? "link_only" : "pending"})
        ON CONFLICT (competitor_id, platform) DO UPDATE SET
          handle = EXCLUDED.handle,
          url    = EXCLUDED.url,
          updated_at = now()
      `;
    }
    const keep = linked.map((l) => l.platform);
    if (keep.length > 0) {
      await sql`
        DELETE FROM social_profiles
        WHERE competitor_id = ${c.id} AND platform <> ALL(${keep}::text[])
      `;
    } else {
      await sql`DELETE FROM social_profiles WHERE competitor_id = ${c.id}`;
    }
  }

  // Load the reconciled fetchable profiles once.
  const profiles = (await sql`
    SELECT sp.id, sp.competitor_id, sp.platform, sp.handle, sp.url
    FROM social_profiles sp
    JOIN competitors c ON c.id = sp.competitor_id
    WHERE c.project_id = ${projectId}
      AND sp.platform = ANY(${FETCHED_PLATFORMS}::text[])
      AND (${opts?.onlyCompetitorId ?? null}::uuid IS NULL OR sp.competitor_id = ${opts?.onlyCompetitorId ?? null}::uuid)
  `) as ProfileRow[];
  const byPlatform = (p: SocialPlatform) => profiles.filter((x) => x.platform === p);

  async function writeSnapshot(profileId: string, data: {
    followers?: number | null; following?: number | null; postsCount?: number | null;
    avgLikes?: number | null; avgComments?: number | null; engagementRate?: number | null;
  }) {
    await sql`
      INSERT INTO social_profile_snapshots
        (profile_id, followers, following, posts_count, avg_likes, avg_comments, engagement_rate)
      VALUES
        (${profileId}, ${data.followers ?? null}, ${data.following ?? null}, ${data.postsCount ?? null},
         ${data.avgLikes ?? null}, ${data.avgComments ?? null}, ${data.engagementRate ?? null})
      ON CONFLICT (profile_id, captured_on) DO UPDATE SET
        captured_at     = now(),
        followers       = EXCLUDED.followers,
        following       = EXCLUDED.following,
        posts_count     = EXCLUDED.posts_count,
        avg_likes       = EXCLUDED.avg_likes,
        avg_comments    = EXCLUDED.avg_comments,
        engagement_rate = EXCLUDED.engagement_rate
    `;
    t.snapshotsWritten++;
  }

  async function markFailed(profileId: string, msg: string) {
    await sql`
      UPDATE social_profiles
      SET fetch_status = 'failed', fetch_error = ${msg.slice(0, 500)},
          last_fetched_at = now(), updated_at = now()
      WHERE id = ${profileId}
    `;
  }

  // ── Step 2: Instagram via Apify — ONE batched call for all due handles ──
  const igProfiles = byPlatform("instagram");
  if (igProfiles.length > 0 && !apifyEnabled()) {
    // Be honest on the hub instead of leaving the row "pending" forever —
    // the operator needs to know the token is the missing piece.
    for (const p of igProfiles) {
      await markFailed(p.id, "Instagram fetching isn't configured yet (APIFY_TOKEN not set)");
    }
    t.errors.push("instagram: APIFY_TOKEN not set — Instagram tier skipped");
  }
  if (igProfiles.length > 0 && apifyEnabled()) {
    const after = await reserveCalls(project.user_id, "social_fetches", igProfiles.length);
    if (!ownerIsAdmin && after > limits.socialFetchesPerCycle) {
      t.errors.push("social fetch budget reached — Instagram skipped this cycle");
      captureBreadcrumb("social: fetch budget reached", { projectId, userId: project.user_id });
    } else {
      try {
        const results = await fetchInstagramProfiles(igProfiles.map((p) => p.handle));
        const byHandle = new Map<string, IgProfileResult>(results.map((r) => [r.username, r]));
        for (const p of igProfiles) {
          const r = byHandle.get(p.handle.toLowerCase());
          if (!r) {
            await markFailed(p.id, "Profile not returned by the scraper — private or nonexistent account?");
            continue;
          }
          await sql`
            UPDATE social_profiles SET
              full_name       = ${r.fullName},
              biography       = ${r.biography},
              profile_pic_url = ${r.profilePicUrl},
              is_verified     = ${r.isVerified},
              followers       = ${r.followers},
              following       = ${r.following},
              posts_count     = ${r.postsCount},
              external_url    = ${r.externalUrl},
              last_fetched_at = now(),
              fetch_status    = 'ok',
              fetch_error     = NULL,
              updated_at      = now()
            WHERE id = ${p.id}
          `;
          const likes = r.latestPosts.map((x) => x.likes).filter((n): n is number => n !== null);
          const comments = r.latestPosts.map((x) => x.comments).filter((n): n is number => n !== null);
          const avgLikes = likes.length ? likes.reduce((a, b) => a + b, 0) / likes.length : null;
          const avgComments = comments.length ? comments.reduce((a, b) => a + b, 0) / comments.length : null;
          const engagementRate = avgLikes !== null && r.followers && r.followers > 0
            ? Number((((avgLikes + (avgComments ?? 0)) / r.followers) * 100).toFixed(4))
            : null;
          await writeSnapshot(p.id, {
            followers: r.followers, following: r.following, postsCount: r.postsCount,
            avgLikes, avgComments, engagementRate,
          });
          for (const post of r.latestPosts) {
            await sql`
              INSERT INTO social_posts
                (profile_id, platform_post_id, url, post_type, caption, display_url,
                 likes, comments, video_views, posted_at, raw)
              VALUES
                (${p.id}, ${post.shortCode}, ${post.url}, ${post.type}, ${post.caption},
                 ${post.displayUrl}, ${post.likes}, ${post.comments}, ${post.videoViews},
                 ${post.postedAt}, ${JSON.stringify(post.raw)}::jsonb)
              ON CONFLICT (profile_id, platform_post_id) DO UPDATE SET
                likes        = EXCLUDED.likes,
                comments     = EXCLUDED.comments,
                video_views  = EXCLUDED.video_views,
                caption      = EXCLUDED.caption,
                display_url  = EXCLUDED.display_url,
                posted_at    = COALESCE(EXCLUDED.posted_at, social_posts.posted_at),
                raw          = EXCLUDED.raw,
                last_seen_at = now()
            `;
          }
          t.profilesFetched++;
          updatedCompetitors.add(p.competitor_id);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Apify fetch failed";
        t.errors.push(`instagram: ${msg}`);
        captureError(e, { stage: "social.instagram", projectId });
      }
    }
  }

  // ── Step 3: YouTube — direct fetch first ($0), ScraperAPI fallback ──
  // Channel pages answer plain GETs with a browser UA, and ScraperAPI 403s
  // youtube.com on some plans — so the free path is also the reliable one.
  // The fallback only burns a scrape tick when the direct path failed.
  for (const p of byPlatform("youtube")) {
    try {
      let subs = await fetchYouTubeSubscribersDirect(p.url);
      if (subs === null) {
        const after = await reserveCalls(project.user_id, "scrape_calls");
        if (after > limits.scrapeCallsPerCycle) {
          t.errors.push("scrape budget reached — YouTube fallback skipped");
        } else {
          try {
            const { html } = await standardScrape({ url: p.url });
            subs = parseYouTubeSubscribers(html);
          } catch {
            /* fall through with subs = null */
          }
        }
      }
      if (subs === null) {
        await markFailed(p.id, "No subscriber count found — the channel link may be outdated");
        continue;
      }
      await sql`
        UPDATE social_profiles SET followers = ${subs}, last_fetched_at = now(),
          fetch_status = 'ok', fetch_error = NULL, updated_at = now()
        WHERE id = ${p.id}
      `;
      await writeSnapshot(p.id, { followers: subs });
      t.profilesFetched++;
      updatedCompetitors.add(p.competitor_id);
    } catch (e) {
      await markFailed(p.id, e instanceof Error ? e.message : "YouTube fetch failed");
    }
  }

  // ── Step 4: Reddit — free about.json, ScraperAPI fallback for blocked IPs ──
  for (const p of byPlatform("reddit")) {
    try {
      let members = await fetchRedditMembers(p.url);
      if (members === null) {
        // Reddit serves an HTML interstitial to some IP ranges; the same JSON
        // usually comes through fine via ScraperAPI's proxy pool.
        const aboutUrl = redditAboutUrl(p.url);
        if (aboutUrl) {
          const after = await reserveCalls(project.user_id, "scrape_calls");
          if (after > limits.scrapeCallsPerCycle) {
            t.errors.push("scrape budget reached — Reddit fallback skipped");
          } else {
            try {
              const { html } = await standardScrape({ url: aboutUrl });
              members = parseRedditAbout(JSON.parse(html));
            } catch {
              /* fall through with members = null */
            }
          }
        }
      }
      if (members === null) {
        await markFailed(p.id, "No member count returned — Reddit may be blocking requests");
        continue;
      }
      await sql`
        UPDATE social_profiles SET followers = ${members}, last_fetched_at = now(),
          fetch_status = 'ok', fetch_error = NULL, updated_at = now()
        WHERE id = ${p.id}
      `;
      await writeSnapshot(p.id, { followers: members });
      t.profilesFetched++;
      updatedCompetitors.add(p.competitor_id);
    } catch (e) {
      await markFailed(p.id, e instanceof Error ? e.message : "Reddit fetch failed");
    }
  }

  // ── Step 5: LinkedIn — fresh premium scrape on demand, else weekly scan ──
  // The daily cron relies on the weekly LinkedIn scrape stored in `sources`
  // (LinkedIn needs premium+render, ~5× cost — too pricey to hit daily). But
  // a MANUAL "Refresh social data" click, or any admin run, scrapes a fresh
  // page right now so the number isn't blank while waiting for the weekly
  // cadence. Admins skip the scrape budget.
  const freshLinkedIn = !!opts?.onlyCompetitorId || ownerIsAdmin;
  for (const p of byPlatform("linkedin")) {
    try {
      let text: string | null = null;

      if (freshLinkedIn) {
        const after = await reserveCalls(project.user_id, "scrape_calls");
        if (ownerIsAdmin || after <= limits.scrapeCallsPerCycle) {
          try {
            const { html } = await standardScrape({ url: p.url, premium: true, render: true });
            const cleaned = cleanForStorage(html);
            if (cleaned.ok) {
              const name = competitors.find((c) => c.id === p.competitor_id)?.name ?? "Competitor";
              await upsertSource({
                projectId,
                competitorId: p.competitor_id,
                title: cleaned.title || `${name} on LinkedIn`,
                url: p.url,
                sourceType: "Competitor Website",
                cleanedText: cleaned.snippet,
                contentSnippet: cleaned.snippet.slice(0, 280),
              });
              text = cleaned.snippet;
            }
          } catch (e) {
            captureBreadcrumb("social: LinkedIn fresh scrape failed, falling back to stored", {
              projectId, competitorId: p.competitor_id, msg: e instanceof Error ? e.message : "?",
            });
          }
        }
      }

      // Fall back to the most recent stored LinkedIn scrape (weekly cadence).
      if (!text) {
        const rows = (await sql`
          SELECT cleaned_text FROM sources
          WHERE project_id = ${projectId} AND competitor_id = ${p.competitor_id}
            AND domain = 'linkedin.com' AND cleaned_text IS NOT NULL
          ORDER BY scraped_at DESC LIMIT 1
        `) as { cleaned_text: string }[];
        if (rows.length === 0) continue; // nothing scraped yet — stay pending
        text = rows[0].cleaned_text;
      }

      const followers = parseLinkedInFollowers(text);
      if (followers === null) {
        await markFailed(p.id, "Couldn't read a follower count from LinkedIn (the page may be login-gated)");
        continue;
      }
      await sql`
        UPDATE social_profiles SET followers = ${followers}, last_fetched_at = now(),
          fetch_status = 'ok', fetch_error = NULL, updated_at = now()
        WHERE id = ${p.id}
      `;
      await writeSnapshot(p.id, { followers });
      t.profilesFetched++;
      updatedCompetitors.add(p.competitor_id);
    } catch (e) {
      await markFailed(p.id, e instanceof Error ? e.message : "LinkedIn fetch failed");
    }
  }

  // ── Step 6: delta detection → signals ──
  try {
    t.signalsCreated = await detectAndEmitSignals(projectId, limits.maxSignalsPerProjectPerDay, project.user_id, competitors, opts?.onlyCompetitorId);
  } catch (e) {
    t.errors.push(`signals: ${e instanceof Error ? e.message : "failed"}`);
    captureError(e, { stage: "social.signals", projectId });
  }

  // ── Step 6.5: Instagram post CONTENT → signals ──
  // The real "what did the competitor announce" path: read the captions of
  // newly-fetched posts and turn genuine developments into signals that land
  // in the daily brief. Each post is analyzed exactly once (analyzed_at).
  try {
    t.signalsCreated += await analyzeAndEmitPostSignals(
      projectId, limits.maxSignalsPerProjectPerDay, project.user_id, project, competitors, opts?.onlyCompetitorId,
    );
  } catch (e) {
    t.errors.push(`post-signals: ${e instanceof Error ? e.message : "failed"}`);
    captureError(e, { stage: "social.postSignals", projectId });
  }

  // ── Step 7: AI insight regen per updated competitor ──
  for (const c of competitors) {
    if (!updatedCompetitors.has(c.id)) continue;
    try {
      await regenerateInsight(project, c);
      t.insightsRegenerated++;
    } catch (e) {
      t.errors.push(`insight:${c.name}: ${e instanceof Error ? e.message : "failed"}`);
      captureError(e, { stage: "social.insight", projectId, competitorId: c.id });
    }
  }

  return t;
}

/* ─────────────────────────── delta → signal ─────────────────────────── */

interface DeltaRow {
  profile_id: string;
  competitor_id: string;
  platform: SocialPlatform;
  url: string;
  today_followers: number;
  baseline_followers: number;
  baseline_date: string;
}

async function detectAndEmitSignals(
  projectId: string,
  maxSignalsPerDay: number,
  userId: string,
  competitors: CompetitorRow[],
  onlyCompetitorId?: string,
): Promise<number> {
  const sql = requireSql();
  const nameById = new Map(competitors.map((c) => [c.id, c.name]));

  // Today's snapshot joined to the closest snapshot ≥6 days old (the weekly
  // baseline). LATERAL keeps it one round trip.
  const deltas = (await sql`
    SELECT sp.id AS profile_id, sp.competitor_id, sp.platform, sp.url,
           today.followers AS today_followers,
           base.followers  AS baseline_followers,
           base.captured_on::text AS baseline_date
    FROM social_profiles sp
    JOIN competitors c ON c.id = sp.competitor_id
    JOIN LATERAL (
      SELECT followers FROM social_profile_snapshots
      WHERE profile_id = sp.id AND captured_on = CURRENT_DATE AND followers IS NOT NULL
      LIMIT 1
    ) today ON true
    JOIN LATERAL (
      SELECT followers, captured_on FROM social_profile_snapshots
      WHERE profile_id = sp.id AND captured_on <= CURRENT_DATE - 6 AND followers IS NOT NULL
      ORDER BY captured_on DESC LIMIT 1
    ) base ON true
    WHERE c.project_id = ${projectId}
      AND (${onlyCompetitorId ?? null}::uuid IS NULL OR sp.competitor_id = ${onlyCompetitorId ?? null}::uuid)
  `) as DeltaRow[];

  // IG posting surge: posts in the last 7 days vs the 7 days before.
  const surges = (await sql`
    SELECT sp.id AS profile_id, sp.competitor_id, sp.url,
           COUNT(*) FILTER (WHERE po.posted_at >= now() - interval '7 days')::int AS recent,
           COUNT(*) FILTER (WHERE po.posted_at >= now() - interval '14 days'
                              AND po.posted_at <  now() - interval '7 days')::int AS prior
    FROM social_profiles sp
    JOIN competitors c ON c.id = sp.competitor_id
    JOIN social_posts po ON po.profile_id = sp.id
    WHERE c.project_id = ${projectId} AND sp.platform = 'instagram'
      AND (${onlyCompetitorId ?? null}::uuid IS NULL OR sp.competitor_id = ${onlyCompetitorId ?? null}::uuid)
    GROUP BY sp.id, sp.competitor_id, sp.url
  `) as { profile_id: string; competitor_id: string; url: string; recent: number; prior: number }[];

  type Candidate = {
    competitorId: string; platform: SocialPlatform; url: string;
    title: string; description: string; importance: "Medium" | "High";
    action: string;
  };
  const candidates: Candidate[] = [];

  for (const d of deltas) {
    if (d.baseline_followers <= 0) continue;
    const delta = d.today_followers - d.baseline_followers;
    const pct = (delta / d.baseline_followers) * 100;
    if (Math.abs(delta) < 500 || Math.abs(pct) < 5) continue;
    const name = nameById.get(d.competitor_id) ?? "Competitor";
    const noun = FOLLOWER_NOUN[d.platform];
    const label = PLATFORM_LABELS[d.platform];
    const grew = delta > 0;
    candidates.push({
      competitorId: d.competitor_id,
      platform: d.platform,
      url: d.url,
      title: `${name} ${grew ? "gained" : "lost"} ${Math.abs(pct).toFixed(1)}% ${label} ${noun} in a week`,
      description: `${name}'s ${label} ${noun} went from ${d.baseline_followers.toLocaleString()} (${d.baseline_date}) to ${d.today_followers.toLocaleString()} — ${grew ? "+" : ""}${delta.toLocaleString()} in roughly a week.`,
      importance: Math.abs(pct) >= 15 ? "High" : "Medium",
      action: grew
        ? `Review ${name}'s recent ${label} content to see what's driving the growth.`
        : `Watch whether ${name}'s ${label} decline continues — it may signal a misstep you can capitalize on.`,
    });
  }

  for (const s of surges) {
    if (s.recent < 3) continue;
    if (s.recent < 2 * Math.max(s.prior, 1)) continue;
    const name = nameById.get(s.competitor_id) ?? "Competitor";
    candidates.push({
      competitorId: s.competitor_id,
      platform: "instagram",
      url: s.url,
      title: `${name} ramped up Instagram posting`,
      description: `${name} published ${s.recent} Instagram posts in the last 7 days vs ${s.prior} the week before — a clear push.`,
      importance: "Medium",
      action: `Check what ${name} is promoting — a posting surge usually precedes a launch or campaign.`,
    });
  }

  if (candidates.length === 0) return 0;

  // Per-project/day rail (same as the AI extraction path).
  const todayRows = (await sql`
    SELECT COUNT(*)::int AS n FROM signals
    WHERE project_id = ${projectId} AND created_at >= date_trunc('day', now())
  `) as { n: number }[];
  let remaining = Math.max(0, maxSignalsPerDay - (todayRows[0]?.n ?? 0));

  let created = 0;
  for (const cand of candidates) {
    if (remaining <= 0) break;
    const name = nameById.get(cand.competitorId) ?? "Competitor";
    // Source row for the profile URL — the signal's verifiable citation.
    const source = await upsertSource({
      projectId,
      competitorId: cand.competitorId,
      title: `${name} on ${PLATFORM_LABELS[cand.platform]}`,
      url: cand.url,
      sourceType: "Competitor Website",
      contentSnippet: cand.description,
    });
    // Anti-spam: one social signal per profile-source per 7 days. Without
    // this, a sustained spike re-fires daily (today vs rolling baseline).
    const dupRows = (await sql`
      SELECT 1 FROM signals s
      JOIN signal_sources ss ON ss.signal_id = s.id
      WHERE ss.source_id = ${source.id}
        AND s.created_at >= now() - interval '7 days'
      LIMIT 1
    `) as unknown[];
    if (dupRows.length > 0) continue;

    await withTx(async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO signals
          (project_id, title, category, description, importance, confidence_score, suggested_action)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        [projectId, cand.title, "Competitor Move", cand.description, cand.importance, 95, cand.action],
      );
      await client.query(
        `INSERT INTO signal_sources (signal_id, source_id) VALUES ($1, $2)
         ON CONFLICT (signal_id, source_id) DO NOTHING`,
        [rows[0].id, source.id],
      );
    });
    created++;
    remaining--;
  }

  if (created > 0) {
    try {
      await reserveCalls(userId, "signals_generated", created);
    } catch (e) {
      captureError(e, { stage: "social.signals.counter", projectId });
    }
  }
  return created;
}

/* ──────────────────── Instagram post content → signals ──────────────────── */

const POST_SIGNAL_CATEGORIES = [
  "Competitor Move", "Customer Pain Point", "Market Opportunity", "Threat / Risk",
  "Trend Signal", "Regulation / Policy", "Pricing / Offer Change",
  "Service Demand Signal", "Industry Event",
] as const;

const POST_SIGNALS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["signals"],
  properties: {
    signals: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["post_ref", "title", "category", "description", "importance"],
        properties: {
          post_ref: { type: "integer" },
          title: { type: "string", minLength: 1, maxLength: 120 },
          category: { type: "string", enum: POST_SIGNAL_CATEGORIES as unknown as string[] },
          description: { type: "string", minLength: 1, maxLength: 400 },
          importance: { type: "string", enum: ["Low", "Medium", "High"] },
        },
      },
    },
  },
} as const;

const postSignalsZod = z.object({
  signals: z.array(z.object({
    post_ref: z.number().int(),
    title: z.string().min(1),
    category: z.string(),
    description: z.string().min(1),
    importance: z.enum(["Low", "Medium", "High"]),
  })),
});

interface UnanalyzedPost {
  id: string;
  competitor_id: string;
  url: string;
  caption: string | null;
  post_type: string | null;
  likes: number | null;
  comments: number | null;
  posted_at: string | null;
}

/**
 * Read newly-fetched Instagram posts (analyzed_at IS NULL), ask the model
 * which ones reveal a real business development, and emit those as signals
 * citing the post URL. Then stamp EVERY fed post analyzed_at = now() so it's
 * never re-analyzed — one LLM consideration per post, ever.
 *
 * Runs per competitor so the prompt stays small and the post_ref → URL
 * mapping is unambiguous. Shares the per-project/day signal cap with the
 * delta detector (counts today's signals live).
 */
async function analyzeAndEmitPostSignals(
  projectId: string,
  maxSignalsPerDay: number,
  userId: string,
  project: ProjectRow,
  competitors: CompetitorRow[],
  onlyCompetitorId?: string,
): Promise<number> {
  const sql = requireSql();
  const market = resolveMarket(project.target_market);

  const rows = (await sql`
    SELECT po.id, sp.competitor_id, po.url, po.caption, po.post_type,
           po.likes, po.comments, po.posted_at::text AS posted_at
    FROM social_posts po
    JOIN social_profiles sp ON sp.id = po.profile_id
    JOIN competitors c ON c.id = sp.competitor_id
    WHERE c.project_id = ${projectId}
      AND sp.platform = 'instagram'
      AND po.analyzed_at IS NULL
      AND (${onlyCompetitorId ?? null}::uuid IS NULL OR sp.competitor_id = ${onlyCompetitorId ?? null}::uuid)
    ORDER BY sp.competitor_id, po.posted_at DESC NULLS LAST
    LIMIT 200
  `) as UnanalyzedPost[];
  if (rows.length === 0) return 0;

  // Daily cap shared with the delta detector.
  const todayRows = (await sql`
    SELECT COUNT(*)::int AS n FROM signals
    WHERE project_id = ${projectId} AND created_at >= date_trunc('day', now())
  `) as { n: number }[];
  let remaining = Math.max(0, maxSignalsPerDay - (todayRows[0]?.n ?? 0));

  const nameById = new Map(competitors.map((c) => [c.id, c.name]));
  const byCompetitor = new Map<string, UnanalyzedPost[]>();
  for (const r of rows) {
    const arr = byCompetitor.get(r.competitor_id) ?? [];
    arr.push(r);
    byCompetitor.set(r.competitor_id, arr);
  }

  const systemPrompt = [
    "You extract business-relevant developments from a competitor's recent Instagram posts for a market-intelligence user.",
    "Output strict JSON only: { \"signals\": [ { post_ref, title, category, description, importance } ] }.",
    "Rules:",
    "  1. Emit a signal ONLY for posts that reveal a REAL development: product/feature launch, pricing or promo/offer change, partnership, funding/acquisition, market or location expansion, a notable hiring push, a campaign launch, or an event/conference the competitor is hosting or attending.",
    "  2. SKIP routine content with no strategic signal: lifestyle/culture posts, memes, generic motivational quotes, holiday greetings, reposts, giveaways/engagement-bait, and vague teasers.",
    "  3. post_ref MUST be one of the provided [ref] numbers. One signal per post at most.",
    "  4. category MUST be one of: Competitor Move, Customer Pain Point, Market Opportunity, Threat / Risk, Trend Signal, Regulation / Policy, Pricing / Offer Change, Service Demand Signal, Industry Event.",
    "  5. importance Low/Medium/High — High only for launches, pricing moves, funding, or expansion that clearly affect the user's market.",
    "  6. Title <= 120 chars, lead with the competitor name. Description: what they announced and why it matters. Use ONLY what the caption states — never invent specifics.",
    "  7. If none of the posts carry a real development, return an empty signals array.",
  ].join("\n");

  let created = 0;
  for (const [competitorId, posts] of byCompetitor) {
    if (remaining <= 0) break;
    const name = nameById.get(competitorId) ?? "Competitor";
    // Map ref index → post for citation after the model replies.
    const refMap = posts.slice(0, 12);
    const postLines = refMap.map((p, i) => {
      const cap = (p.caption || "(no caption)").replace(/\s+/g, " ").slice(0, 220);
      const date = p.posted_at ? p.posted_at.slice(0, 10) : "?";
      return `[${i}] ${date} · ${p.post_type || "Post"} · ${p.likes ?? "?"} likes / ${p.comments ?? "?"} comments\n    ${cap}`;
    });

    const userPrompt = [
      `Competitor: ${name}`,
      `User's industry: ${project.industry} · Target market: ${market.canonicalName}`,
      "",
      "Recent Instagram posts:",
      ...postLines,
      "",
      "Return strict JSON: { \"signals\": [ { post_ref, title, category, description, importance } ] }",
    ].join("\n");

    try {
      const ai = await chatJson({
        schemaName: "issuefy_ig_post_signals",
        jsonSchema: POST_SIGNALS_JSON_SCHEMA,
        zodSchema: postSignalsZod,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        maxTokens: 900,
        temperature: 0.2,
      });

      for (const s of ai.data.signals) {
        if (remaining <= 0) break;
        const post = refMap[s.post_ref];
        if (!post) continue;
        const category = (POST_SIGNAL_CATEGORIES as readonly string[]).includes(s.category)
          ? s.category : "Competitor Move";
        const source = await upsertSource({
          projectId,
          competitorId,
          title: `${name} — Instagram post`,
          url: post.url,
          sourceType: "Public Discussion",
          contentSnippet: (post.caption || s.description).slice(0, 280),
        });
        // Dedup: never double-signal the same post within a week.
        const dup = (await sql`
          SELECT 1 FROM signals si JOIN signal_sources ss ON ss.signal_id = si.id
          WHERE ss.source_id = ${source.id} AND si.created_at >= now() - interval '7 days' LIMIT 1
        `) as unknown[];
        if (dup.length > 0) continue;

        await withTx(async (client) => {
          const { rows: ins } = await client.query<{ id: string }>(
            `INSERT INTO signals
              (project_id, title, category, description, importance, confidence_score, suggested_action)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [projectId, s.title.slice(0, 120), category, s.description, s.importance, 90,
             `Review ${name}'s Instagram — they're signaling a move worth tracking.`],
          );
          await client.query(
            `INSERT INTO signal_sources (signal_id, source_id) VALUES ($1, $2)
             ON CONFLICT (signal_id, source_id) DO NOTHING`,
            [ins[0].id, source.id],
          );
        });
        created++;
        remaining--;
      }
    } catch (e) {
      captureBreadcrumb("social: post-signal extraction failed", {
        projectId, competitorId, msg: e instanceof Error ? e.message : "?",
      });
    }

    // Stamp ALL fed posts analyzed (signaled or not) so they're never re-fed.
    const ids = posts.map((p) => p.id);
    await sql`UPDATE social_posts SET analyzed_at = now() WHERE id = ANY(${ids}::uuid[])`;
  }

  if (created > 0) {
    try { await reserveCalls(userId, "signals_generated", created); }
    catch (e) { captureError(e, { stage: "social.postSignals.counter", projectId }); }
  }
  return created;
}

/* ─────────────────────────── AI insight ─────────────────────────── */

const INSIGHT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insight_text", "highlights"],
  properties: {
    insight_text: { type: "string", minLength: 200, maxLength: 1200 },
    highlights: {
      type: "array",
      minItems: 3,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "detail"],
        properties: {
          label: { type: "string", minLength: 1, maxLength: 60 },
          detail: { type: "string", minLength: 1, maxLength: 240 },
        },
      },
    },
  },
} as const;

const insightZod = z.object({
  insight_text: z.string().min(1),
  highlights: z.array(z.object({ label: z.string(), detail: z.string() })).min(1).max(8),
});

async function regenerateInsight(project: ProjectRow, competitor: CompetitorRow): Promise<void> {
  const sql = requireSql();

  const profiles = (await sql`
    SELECT id, platform, handle, followers, following, posts_count, biography, fetch_status
    FROM social_profiles WHERE competitor_id = ${competitor.id}
  `) as Array<{
    id: string; platform: SocialPlatform; handle: string;
    followers: number | null; following: number | null; posts_count: number | null;
    biography: string | null; fetch_status: string;
  }>;
  const fetched = profiles.filter((p) => p.fetch_status === "ok" && p.followers !== null);
  if (fetched.length === 0) return;

  // Up to 8 evenly spaced snapshot points per platform over the last 35 days.
  const trendLines: string[] = [];
  for (const p of fetched) {
    const snaps = (await sql`
      SELECT captured_on::text AS d, followers
      FROM social_profile_snapshots
      WHERE profile_id = ${p.id} AND captured_on >= CURRENT_DATE - 35 AND followers IS NOT NULL
      ORDER BY captured_on ASC
    `) as { d: string; followers: number }[];
    if (snaps.length < 2) continue;
    const step = Math.max(1, Math.ceil(snaps.length / 8));
    const sampled = snaps.filter((_, i) => i % step === 0 || i === snaps.length - 1);
    trendLines.push(
      `${PLATFORM_LABELS[p.platform]}: ` +
      sampled.map((s) => `${s.d}: ${s.followers.toLocaleString()}`).join(" → "),
    );
  }

  const igProfile = fetched.find((p) => p.platform === "instagram");
  let postLines: string[] = [];
  if (igProfile) {
    const posts = (await sql`
      SELECT post_type, caption, likes, comments, video_views, posted_at
      FROM social_posts WHERE profile_id = ${igProfile.id}
      ORDER BY posted_at DESC NULLS LAST LIMIT 12
    `) as Array<{ post_type: string | null; caption: string | null; likes: number | null; comments: number | null; video_views: number | null; posted_at: string | null }>;
    postLines = posts.map((p) => {
      const cap = (p.caption || "(no caption)").replace(/\s+/g, " ").slice(0, 150);
      const date = p.posted_at ? p.posted_at.slice(0, 10) : "?";
      const views = p.video_views ? ` · ${p.video_views.toLocaleString()} views` : "";
      return `[${date} · ${p.post_type || "Post"}] ${cap} — ${p.likes ?? "?"} likes · ${p.comments ?? "?"} comments${views}`;
    });
  }

  const statLines = fetched.map((p) =>
    `${PLATFORM_LABELS[p.platform]} (@${p.handle}): ${p.followers?.toLocaleString()} ${FOLLOWER_NOUN[p.platform]}` +
    (p.posts_count !== null ? ` · ${p.posts_count.toLocaleString()} posts` : ""),
  );

  const market = resolveMarket(project.target_market);
  const companyBlock = project.company_name
    ? `The user's company: ${project.company_name} — ${project.company_description || "(no description)"}`
    : "(User has no company profile — analyze from a neutral market perspective.)";

  const systemPrompt = [
    "You are Issuefy, a market-intelligence analyst summarizing a competitor's social-media presence for a business user.",
    "Output strict JSON only: { \"insight_text\": string, \"highlights\": [{\"label\", \"detail\"}] }.",
    "Rules:",
    "  1. insight_text: ONE editorial paragraph, 80–140 words. No bullets, no headings.",
    "  2. Use ONLY the data provided. Never invent numbers, posts, or platforms.",
    "  3. Cover: posting cadence, content themes (from captions), engagement quality, and follower trajectory.",
    "  4. End with what the user should learn from or counter — framed relative to the user's company when provided.",
    "  5. highlights: 3–5 short label/detail pairs (label ≤ 4 words, e.g. \"Posting cadence\", \"Top format\").",
    "  6. If data is thin (few posts, one platform), say so honestly rather than padding.",
  ].join("\n");

  const userPrompt = [
    `Competitor: ${competitor.name} (${competitor.website_url})`,
    `User's industry: ${project.industry} · Business type: ${project.business_type} · Target market: ${market.canonicalName}`,
    companyBlock,
    "",
    "Current platform stats:",
    ...statLines,
    "",
    trendLines.length ? "Follower trend (sampled):" : "(No trend history yet — first snapshots.)",
    ...trendLines,
    "",
    postLines.length ? "Latest Instagram posts:" : "(No Instagram posts available.)",
    ...postLines,
    "",
    "Return strict JSON: { \"insight_text\": \"...\", \"highlights\": [ { \"label\", \"detail\" } ] }",
  ].join("\n");

  const ai = await chatJson({
    schemaName: "issuefy_social_insight",
    jsonSchema: INSIGHT_JSON_SCHEMA,
    zodSchema: insightZod,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 800,
    temperature: 0.2,
  });

  await sql`
    INSERT INTO social_insights (competitor_id, insight_text, highlights, model_used)
    VALUES (${competitor.id}, ${ai.data.insight_text}, ${JSON.stringify(ai.data.highlights)}::jsonb, ${ai.modelUsed})
    ON CONFLICT (competitor_id) DO UPDATE SET
      insight_text = EXCLUDED.insight_text,
      highlights   = EXCLUDED.highlights,
      model_used   = EXCLUDED.model_used,
      updated_at   = now()
  `;
}
