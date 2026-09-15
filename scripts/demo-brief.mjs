#!/usr/bin/env node
// Operator-only utility. No application transport overrides or quota bypasses.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Script } from 'node:vm';
import { format } from 'node:util';
import dotenv from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
export const PIN = Object.freeze({
  host: 'ep-wild-forest-aoi2r1l6.c-2.ap-southeast-1.aws.neon.tech',
  database: 'issuefy_staging',
  project: '0e78bac5-1896-41a3-a40c-20b1474f403d',
  email: 'issuefy-20260915+clerk_test@example.com',
  primary: 'google/gemini-2.0-flash-001',
  fallback: 'openai/gpt-4o-mini',
});
const envRoot = '/Users/alpyalti/Desktop/ClaudeProjects/Issuefy';
const check = (condition, message) => { if (!condition) throw new Error(message); };

export function buildEnvironment(staging, providers) {
  let url;
  try { url = new URL(staging.DATABASE_URL); } catch { throw new Error('Invalid staging DATABASE_URL'); }
  check(['postgres:', 'postgresql:'].includes(url.protocol) && url.hostname === PIN.host &&
    url.pathname === `/${PIN.database}` && (!url.port || url.port === '5432') &&
    url.username && url.password && !url.hash, 'Database target does not match staging pin');
  for (const [key, value] of url.searchParams) {
    check((key === 'sslmode' && ['require', 'verify-full'].includes(value)) ||
      (key === 'channel_binding' && value === 'require'), 'Unexpected database URL option');
  }
  check(staging.BILLING_DATA_ENVIRONMENT === 'isolated_test' && staging.VERCEL_ENV !== 'production', 'Isolated test billing required');
  check(/^(sk|rk)_test_\S+$/.test(staging.STRIPE_SECRET_KEY || ''), 'Test Stripe key required; billing cannot be disabled');
  check(staging.R2_ENABLED !== 'true' && !staging.RESEND_API_KEY && !staging.SENTRY_DSN, 'Unexpected outbound integration enabled in staging');
  check(providers.SCRAPERAPI_KEY?.trim() && providers.OPENROUTER_API_KEY?.trim(), 'Both provider keys required');
  check(providers.OPENROUTER_MODEL_PRIMARY === PIN.primary && providers.OPENROUTER_MODEL_FALLBACK === PIN.fallback, 'Explicit configured model IDs must match pins');
  check(staging.BETA_STARTER_LIMITS !== 'false', 'Demo requires existing beta Starter limits');
  // Reconstruct URL, excluding all alternative-target/libpq options.
  url.search = '?sslmode=require';
  return {
    DATABASE_URL: url.toString(), STRIPE_SECRET_KEY: staging.STRIPE_SECRET_KEY,
    BILLING_DATA_ENVIRONMENT: 'isolated_test', VERCEL_ENV: 'preview',
    NODE_ENV: 'production', APP_URL: 'http://localhost:3001',
    R2_ENABLED: 'false', BETA_STARTER_LIMITS: 'true',
    SCRAPERAPI_KEY: providers.SCRAPERAPI_KEY,
    OPENROUTER_API_KEY: providers.OPENROUTER_API_KEY,
    // Explicit coordinator-approved demo override: original primary is absent
    // from the catalog they checked; retain only the existing fallback model.
    OPENROUTER_MODEL_PRIMARY: PIN.fallback,
    OPENROUTER_MODEL_FALLBACK: PIN.fallback,
  };
}

// Loads real repository TS with existing TypeScript; no mocked app modules,
// global require hooks, generated files, or extra runtime packages.
export function runtime() {
  const ts = require('typescript');
  const cache = new Map();
  function load(relative) {
    const filename = resolve(root, relative);
    check(filename.startsWith(`${root}/lib/`) && filename.endsWith('.ts'), 'Runtime import outside lib');
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const output = ts.transpileModule(readFileSync(filename, 'utf8'), {
      fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const localRequire = id => {
      if (id.startsWith('@/') || id.startsWith('.')) {
        const target = id.startsWith('@/') ? resolve(root, id.slice(2)) : resolve(dirname(filename), id);
        return load(target.endsWith('.ts') ? target : `${target}.ts`);
      }
      return require(id);
    };
    new Script(`(function(exports, require, module, __filename, __dirname) {\n${output}\n})`, { filename })
      .runInThisContext()(module.exports, localRequire, module, filename, dirname(filename));
    return module.exports;
  }
  return load;
}

const noSocials = value => value == null || (typeof value === 'object' && !Array.isArray(value) && Object.values(value).every(v => !v));
export function validateSnapshot(s, market) {
  const { project: p, owner: u, competitors: cs, keywords: ks } = s;
  check(p?.id === PIN.project && u?.id === p.user_id && u.email === PIN.email, 'Project/owner identity mismatch');
  check(p.name === 'Linear — Issuefy Demo' && p.company_name === p.name && !p.company_website &&
    p.company_description === 'Demo evaluation of issue tracking and product planning software for software teams.' &&
    p.industry === 'Software development and work management' && p.business_type === 'SaaS' &&
    p.target_market === 'GLOBAL', 'Demo project inputs changed');
  check(p.is_active === true && u.role === 'user' && u.plan === 'starter', 'Active project and ordinary Starter owner required');
  check(['active', 'trialing', 'past_due', 'paused'].includes(u.subscription_status) && u.stripe_subscription_id && u.stripe_customer_id, 'Eligible owner billing required');
  check(u.email_brief_enabled === false, 'Owner email brief must be disabled');
  check(s.owner_member === true, 'Owner membership required');
  check(market.matched && market.langs.length === 1 && market.langs[0] === 'en', 'Known English-only market required');
  check(noSocials(p.company_socials) && cs.every(c => noSocials(c.socials)), 'Social monitoring must be empty');
  check(cs.length === 2 && cs.every(c => c.is_active) && cs.map(c => c.name.toLowerCase()).sort().join(',') === 'asana,atlassian', 'Expected two active Atlassian/Asana competitors');
  for (const c of cs) {
    let url; try { url = new URL(c.website_url); } catch { throw new Error('Invalid competitor URL'); }
    const host = url.hostname.replace(/^www\./, '');
    check(url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (c.name.toLowerCase() === 'asana' ? host === 'asana.com' && url.pathname === '/' : host === 'atlassian.com' && url.pathname === '/software/jira') &&
      !url.search && !url.hash, 'Unexpected competitor URL');
  }
  check(ks.length === 3 && ks.every(k => k.is_active && k.keyword?.trim() && k.last_discovered_at === null), 'Expected three fresh active keywords');
  check(ks.map(k => k.keyword).sort().join('|') === ['AI project management', 'developer workflow automation', 'issue tracking pricing'].sort().join('|'), 'Demo keywords changed');
  check(s.source_count === 0 && s.job_count === 0 && s.signal_count === 0 && s.summary_count === 0 &&
    p.last_manual_refresh_at === null && p.last_scraped_at === null, 'Fresh project required; never reset existing history');
  return { projectId: p.id, ownerId: u.id, targetMarket: p.target_market, keywords: ks.map(k => k.keyword),
    competitors: cs.map(c => ({ name: c.name, url: c.website_url })),
    expectedRequests: { serp: 3, scrapeAtMost: 11, openrouterAtMost: 3 },
    limits: 'Expected counts for unchanged fresh shape; no hard request, dollar, or wall-time cap.' };
}

async function snapshot(sql) {
  const rows = await sql`SELECT to_jsonb(p) AS project, to_jsonb(u) AS owner,
    EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=u.id AND m.role='owner') AS owner_member,
    (SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) FROM competitors c WHERE c.project_id=p.id) AS competitors,
    (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM keywords k WHERE k.project_id=p.id) AS keywords,
    (SELECT count(*)::int FROM sources x WHERE x.project_id=p.id) AS source_count,
    (SELECT count(*)::int FROM scrape_jobs x WHERE x.project_id=p.id) AS job_count,
    (SELECT count(*)::int FROM signals x WHERE x.project_id=p.id) AS signal_count,
    (SELECT count(*)::int FROM daily_summaries x WHERE x.project_id=p.id) AS summary_count
    FROM projects p JOIN users u ON u.id=p.user_id WHERE p.id=${PIN.project}`;
  check(rows.length === 1, 'Pinned project missing');
  return rows[0];
}

export async function invokeOnce(ownerId, claim, worker, emit) {
  const claimed = await claim(ownerId, PIN.project, false);
  if (claimed instanceof Response) {
    const body = await claimed.text();
    emit({ stage: 'claim-refused', httpStatus: claimed.status, body });
    return 2;
  }
  check(typeof claimed.jobId === 'string' && claimed.jobId !== 'skipped-paused', 'Invalid manual claim');
  emit({ stage: 'claimed', jobId: claimed.jobId });
  const result = await worker(PIN.project, 'manual', claimed.jobId);
  const interpretation = result.errors.length ? 'partial-or-failed; inspect errors' :
    result.signalsInserted > 0 ? 'signals-inserted; inspect summaryStatus' :
    !result.modelUsed ? 'no-model-result; not evidence of no market developments' :
    result.signalsRejected > 0 ? 'all-signals-rejected; inspect source validation' :
    'model-returned-no-accepted-signals; inspect usable sources and summaryStatus';
  emit({ stage: 'worker-result', result, interpretation });
  return result.status === 'failed' || result.errors.length ? 2 : 0;
}

export async function main(args = process.argv.slice(2)) {
  check(args.length === 0 || (args.length === 1 && args[0] === '--run'), 'Usage: node scripts/demo-brief.mjs [--run]');
  const staging = dotenv.parse(readFileSync(`${envRoot}/.env.staging.local`));
  const providers = dotenv.parse(readFileSync(`${envRoot}/.env`));
  const env = buildEnvironment(staging, providers);
  const secrets = [staging.DATABASE_URL, env.DATABASE_URL, new URL(env.DATABASE_URL).password,
    decodeURIComponent(new URL(env.DATABASE_URL).password), env.STRIPE_SECRET_KEY, env.SCRAPERAPI_KEY, env.OPENROUTER_API_KEY].filter(Boolean);
  const redact = value => secrets.reduce((s, key) => s.split(key).join('[REDACTED]'), String(value));
  const emit = value => process.stdout.write(`${redact(JSON.stringify(value))}\n`);
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = (...values) => process.stderr.write(`${redact(format(...values))}\n`);
  // Imported app modules must never observe inherited production integrations.
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  let stage = 'preflight';
  try {
    const load = runtime();
    const { requireSql } = load('lib/db.ts');
    const { resolveMarket } = load('lib/markets.ts');
    const state = await snapshot(requireSql());
    const preflight = validateSnapshot(state, resolveMarket(state.project.target_market));
    emit({ stage, mode: args.length ? 'run' : 'dry-run', ...preflight,
      models: { configuredPrimary: PIN.primary, effectivePrimary: PIN.fallback, effectiveFallback: PIN.fallback,
        reason: 'Coordinator reports original primary absent from current catalog; demo-only override to existing fallback. No catalog request made by runner.' } });
    if (!args.length) return 0;
    const { claimManualRefresh } = load('lib/entitlement-claims.ts');
    const { processProject } = load('lib/process-project.ts');
    stage = 'claim-or-worker';
    return await invokeOnce(preflight.ownerId, claimManualRefresh, processProject, emit);
  } catch (error) {
    emit({ stage, status: 'failed', error: error instanceof Error ? error.message : String(error),
      recovery: 'Inspect emitted claim/job state. Do not automatically retry or reset quotas/timestamps.' });
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(() => {
    // Environment/file validation errors must never echo an input URL or key.
    process.stderr.write('Demo preflight failed before runtime: check pinned environment files and configuration.\n');
    process.exitCode = 1;
  });
}
