import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getProject } from "@/lib/project-data";
import { parseInstagramHandle } from "@/lib/social-stats";
import CompetitorHub, {
  type HubCompetitor, type HubProfile, type HubSnapshot, type HubPost, type HubInsight, type HubSignal,
} from "@/components/competitor/CompetitorHub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const metadata = { title: "Competitor profile — Issuefy" };

type Ctx = { params: Promise<{ projectId: string; competitorId: string }> };

/**
 * Competitor Hub — one page per competitor: identity header, all-platform
 * social stats, Instagram deep-dive (follower graph + engagement + posts),
 * AI insight, and that competitor's recent signals.
 *
 * Renders inside the project dashboard shell (sidebar + topbar via the
 * [projectId] layout). Access control mirrors every other project page:
 * membership via getProject, then competitor must belong to this project.
 */
export default async function CompetitorHubPage({ params }: Ctx) {
  const { projectId, competitorId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  const project = await getProject(projectId, user.id);
  if (!project) notFound();

  const compRows = (await sql`
    SELECT id, name, website_url, description, logo_url, socials, is_active
    FROM competitors
    WHERE id = ${competitorId} AND project_id = ${projectId}
    LIMIT 1
  `) as HubCompetitor[];
  const competitor = compRows[0];
  if (!competitor) notFound();

  const stored = (await sql`
    SELECT id, platform, handle, url, full_name, biography, profile_pic_url,
           is_verified, followers, following, posts_count, external_url,
           last_fetched_at::text AS last_fetched_at, fetch_status, fetch_error
    FROM social_profiles
    WHERE competitor_id = ${competitorId}
    ORDER BY platform
  `) as HubProfile[];

  // social_profiles rows are created by the refresh pipeline (daily cron /
  // manual refresh) — a competitor whose links were just added in Settings,
  // or a project the worker hasn't visited yet, has links in
  // competitors.socials but no rows. Synthesize pending placeholders so the
  // hub reflects Settings truthfully (and the Refresh button shows) instead
  // of claiming "no social accounts linked".
  const profiles = mergeSyntheticProfiles(stored, competitor.socials ?? {});

  const profileIds = stored.map((p) => p.id);

  const [snapshots, posts, insightRows, signals] = await Promise.all([
    profileIds.length
      ? (sql`
          SELECT profile_id, captured_on::text AS captured_on,
                 followers, engagement_rate::float8 AS engagement_rate
          FROM social_profile_snapshots
          WHERE profile_id = ANY(${profileIds}::uuid[])
            AND captured_on >= CURRENT_DATE - 90
          ORDER BY captured_on ASC
        ` as unknown as Promise<HubSnapshot[]>)
      : Promise.resolve([] as HubSnapshot[]),
    profileIds.length
      ? (sql`
          SELECT sp.id, sp.url, sp.post_type, sp.caption, sp.display_url,
                 sp.likes, sp.comments, sp.video_views, sp.posted_at::text AS posted_at
          FROM social_posts sp
          JOIN social_profiles pr ON pr.id = sp.profile_id
          WHERE pr.competitor_id = ${competitorId} AND pr.platform = 'instagram'
          ORDER BY sp.posted_at DESC NULLS LAST
          LIMIT 12
        ` as unknown as Promise<HubPost[]>)
      : Promise.resolve([] as HubPost[]),
    sql`
      SELECT insight_text, highlights, model_used, updated_at::text AS updated_at
      FROM social_insights WHERE competitor_id = ${competitorId} LIMIT 1
    ` as unknown as Promise<HubInsight[]>,
    sql`
      SELECT s.id, s.title, s.category, s.importance, s.created_at::text AS created_at
      FROM signals s
      WHERE s.project_id = ${projectId}
        AND s.dismissed_at IS NULL
        AND EXISTS (
          SELECT 1 FROM signal_sources ss
          JOIN sources src ON src.id = ss.source_id
          WHERE ss.signal_id = s.id AND src.competitor_id = ${competitorId}
        )
      ORDER BY s.created_at DESC
      LIMIT 6
    ` as unknown as Promise<HubSignal[]>,
  ]);

  return (
    <CompetitorHub
      projectId={projectId}
      competitor={competitor}
      profiles={profiles}
      snapshots={snapshots}
      posts={posts}
      insight={insightRows[0] ?? null}
      signals={signals}
    />
  );
}

function mergeSyntheticProfiles(
  stored: HubProfile[],
  socials: Partial<Record<string, string>>,
): HubProfile[] {
  const have = new Set(stored.map((p) => p.platform));
  const synth: HubProfile[] = [];

  const push = (platform: HubProfile["platform"], handle: string, url: string, linkOnly: boolean) => {
    if (have.has(platform)) return;
    synth.push({
      id: `pending-${platform}`,
      platform, handle,
      url: url.startsWith("http") ? url : `https://${url}`,
      full_name: null, biography: null, profile_pic_url: null, is_verified: null,
      followers: null, following: null, posts_count: null, external_url: null,
      last_fetched_at: null,
      fetch_status: linkOnly ? "link_only" : "pending",
      fetch_error: null,
    });
  };

  const ig = socials.instagram?.trim();
  if (ig) {
    const handle = parseInstagramHandle(ig);
    if (handle) push("instagram", handle, `https://www.instagram.com/${handle}/`, false);
  }
  if (socials.youtube?.trim()) push("youtube", socials.youtube.trim(), socials.youtube.trim(), false);
  if (socials.reddit?.trim()) push("reddit", socials.reddit.trim(), socials.reddit.trim(), false);
  if (socials.linkedin?.trim()) push("linkedin", socials.linkedin.trim(), socials.linkedin.trim(), false);
  if (socials.tiktok?.trim()) push("tiktok", socials.tiktok.trim(), socials.tiktok.trim(), true);
  if (socials.facebook?.trim()) push("facebook", socials.facebook.trim(), socials.facebook.trim(), true);

  return [...stored, ...synth];
}
