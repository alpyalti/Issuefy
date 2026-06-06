import { requireUser } from "@/lib/clerk-user";
import { requireSql } from "@/lib/db";
import { getLimits } from "@/lib/usage";
import { json, parseJson, conflict } from "@/lib/api";
import { projectCreateSchema } from "@/lib/schemas/api";
import { captureError } from "@/lib/sentry";

export const runtime = "nodejs";

// GET /api/projects — list every project this user can access (owned or
// member). Each row also carries the caller's role so clients can render
// a chip / disabled state.
export async function GET() {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const sql = requireSql();
  try {
    const rows = await sql`
      SELECT p.id, p.name, p.company_name, p.company_website, p.industry, p.business_type,
             p.target_market, p.last_scraped_at, p.last_manual_refresh_at, p.created_at,
             pm.role AS current_user_role
        FROM projects p
        JOIN project_members pm ON pm.project_id = p.id
       WHERE pm.user_id = ${user.id}
       ORDER BY p.created_at DESC
    `;
    return json({ projects: rows });
  } catch (e) {
    captureError(e, { route: "GET /api/projects", userId: user.id });
    throw e;
  }
}

// POST /api/projects — create a project. Enforces plan project limit.
// Lazy user upsert already happened in requireUser().
export async function POST(req: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;
  const body = await parseJson(req, projectCreateSchema);
  if (body instanceof Response) return body;

  const sql = requireSql();
  const limits = getLimits(user.plan);

  // Plan project limit. Count first, then insert — race is acceptable here:
  // a double-create at the boundary is non-destructive and the trial budgets
  // (PRD §21.3) ultimately prevent real overuse.
  const countRows = (await sql`SELECT COUNT(*)::int AS n FROM projects WHERE user_id = ${user.id}`) as { n: number }[];
  if ((countRows[0]?.n ?? 0) >= limits.projects) {
    return conflict(`Your plan allows ${limits.projects} project${limits.projects === 1 ? "" : "s"}. Upgrade for more.`);
  }

  const trackCompany = body.track_company ?? false;
  try {
    const rows = await sql`
      INSERT INTO projects (
        user_id, name, company_name, company_website, company_description,
        company_logo_url, company_socials, track_company,
        industry, business_type, target_market, description
      ) VALUES (
        ${user.id}, ${body.name},
        ${body.company_name ?? null},
        ${body.company_website ?? null},
        ${body.company_description ?? null},
        ${body.company_logo_url ?? null},
        ${body.company_socials ? JSON.stringify(body.company_socials) : null},
        ${trackCompany},
        ${body.industry}, ${body.business_type}, ${body.target_market},
        ${body.description ?? null}
      )
      RETURNING *
    `;
    const project = rows[0] as { id: string };
    // Mirror the owner into project_members so the new project_members-based
    // auth path (manageableProject, accessibleProject) works immediately.
    // ON CONFLICT keeps this a no-op if the migration backfill already created
    // the row for an existing project being recreated by some odd path.
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${project.id}, ${user.id}, 'owner')
      ON CONFLICT (project_id, user_id) DO NOTHING
    `;
    return json({ project }, { status: 201 });
  } catch (e) {
    captureError(e, { route: "POST /api/projects", userId: user.id });
    throw e;
  }
}
