import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { getOrCreateUser } from "@/lib/clerk-user";
import { getProject } from "@/lib/project-data";
import { Icon } from "@/components/icons/Icon";
import { EmptyState } from "@/components/ui/EmptyState";
import { fmtAgo } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

interface SourceRow {
  id: string;
  title: string;
  url: string;
  domain: string;
  source_type: string;
  scraped_at: string;
  content_snippet: string | null;
}

function colorFor(domain: string): string {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) | 0;
  const palette = ["#2D5BE3", "#168F6B", "#FF6600", "#FF4500", "#E1523D", "#0A66C2", "#146AFF", "#7C3AED", "#DA552F", "#0CAA41"];
  return palette[Math.abs(h) % palette.length];
}
function initialsOf(s: string): string {
  if (!s) return "?";
  const parts = s.replace(/\.[a-z]+$/, "").split(/[\s.-]/).filter(Boolean);
  return (parts.slice(0, 2).map((p) => p[0]).join("") || s[0]).toUpperCase();
}

export default async function SourcesPage({ params }: Ctx) {
  const { projectId } = await params;
  const user = await getOrCreateUser();
  const sql = requireSql();

  // Project ownership comes from the cached helper (layout fetched it already)
  const project = await getProject(projectId, user.id);
  if (!project) notFound();

  const sources = (await sql`
    SELECT id, title, url, domain, source_type, scraped_at, content_snippet
    FROM sources WHERE project_id = ${projectId}
    ORDER BY scraped_at DESC LIMIT 500
  `) as SourceRow[];

  if (sources.length === 0) {
    return (
      <div className="page-wrap">
        <EmptyState
          icon="News01Icon"
          message="No sources yet. The first scrape lands tomorrow morning, or run a manual refresh from the dashboard."
        />
      </div>
    );
  }

  // Group by publication (domain).
  const map = new Map<string, { domain: string; kind: string; items: SourceRow[] }>();
  for (const s of sources) {
    const existing = map.get(s.domain) || { domain: s.domain, kind: s.source_type, items: [] };
    existing.items.push(s);
    map.set(s.domain, existing);
  }
  const pubs = [...map.values()].sort((a, b) => b.items.length - a.items.length);
  const kinds = new Set(sources.map((s) => s.source_type));

  return (
    <div className="page-wrap">
      <div className="sources-summary">
        <div className="ss-stat"><span className="ss-num">{pubs.length}</span><span className="ss-lab">sources tracked</span></div>
        <div className="ss-divider" />
        <div className="ss-stat"><span className="ss-num">{kinds.size}</span><span className="ss-lab">source types</span></div>
        <div className="ss-divider" />
        <div className="ss-stat"><span className="ss-num">{sources.length}</span><span className="ss-lab">links to verify</span></div>
      </div>

      <div className="source-pubs">
        {pubs.map((p) => (
          <div className="source-pub" key={p.domain}>
            <div className="source-pub-head">
              <span className="favicon" style={{ background: colorFor(p.domain), width: 34, height: 34, fontSize: 11 }}>{initialsOf(p.domain)}</span>
              <span className="source-pub-meta">
                <span className="source-pub-name">{p.domain}</span>
                <span className="source-pub-kind">{p.kind} · {p.items.length} link{p.items.length === 1 ? "" : "s"}</span>
              </span>
            </div>
            <div className="source-pub-links">
              {p.items.map((it) => (
                <a key={it.id} className="source-link" href={it.url} target="_blank" rel="noopener noreferrer">
                  <span className="source-link-dot" />
                  <span className="source-link-head">{it.title}</span>
                  <span className="source-link-time">{fmtAgo(it.scraped_at)}</span>
                  <Icon name="ArrowUpRight01Icon" size={14} stroke={1.7} />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
