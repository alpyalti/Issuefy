import { requireUser } from "@/lib/clerk-user";
import { ensureActiveSubscriptionApi } from "@/lib/billing-gate";
import { requireSql } from "@/lib/db";
import { json, parseJson } from "@/lib/api";
import { projectSetupSchema, createProjectSetup, SetupError } from "@/lib/project-setup";
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
  const guard = await ensureActiveSubscriptionApi(user.id);
  if (guard) return guard;
  const body = await parseJson(req, projectSetupSchema);
  if (body instanceof Response) return body;

  try {
    const project = await createProjectSetup(user.id, projectSetupSchema.parse(body));
    return json({ project }, { status: 201 });
  } catch (e) {
    if (e instanceof SetupError) return json({ error: e.message }, { status: e.status });
    captureError(e, { route: "POST /api/projects", userId: user.id });
    return json({ error: "We couldn’t confirm setup. Check your dashboard before retrying." }, { status: 500 });
  }
}
