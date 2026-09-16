#!/usr/bin/env node
// Isolated operator runner; never schedule this against production cron.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';
import dotenv from 'dotenv';
import { PIN, buildEnvironment, validateSnapshot, invokeOnce, runtime } from './demo-brief.mjs';

export const OWNER = 'c1f223c5-4449-494d-a30c-13010e8b2560';
export const LOCK = 'issuefy-isolated-demo-daily:' + PIN.project;
const envRoot = '/Users/alpyalti/Desktop/ClaudeProjects/Issuefy';
const check = (ok, message) => { if (!ok) throw new Error(message); };
export function mode(args) {
  check(args.length === 0 || (args.length === 1 && args[0] === '--run'), 'Usage: node scripts/demo-daily.mjs [--run]');
  return args.length ? 'run' : 'dry-run';
}
export function dailyEnvironment(staging, providers) {
  for (const key of ['SCRAPERAPI_KEY', 'OPENROUTER_API_KEY']) {
    check(providers[key] !== '__ISSUEFY_DISABLED__', 'Required demo provider is explicitly disabled');
  }
  return buildEnvironment(staging, providers);
}

export function validateDaily(s, market) {
  check(s.owner?.id === OWNER && s.project?.user_id === OWNER, 'Exact demo owner UUID required');
  check(['active', 'trialing'].includes(s.owner.subscription_status), 'Daily demo requires active or trialing billing');
  // Reuse every immutable-input guard from the one-shot validator. This view
  // only omits its freshness requirements; no stored history is changed.
  const shape = { ...s, project: { ...s.project, last_manual_refresh_at: null, last_scraped_at: null },
    keywords: s.keywords.map(k => ({ ...k, last_discovered_at: null })),
    source_count: 0, job_count: 0, signal_count: 0, summary_count: 0 };
  const validated = validateSnapshot(shape, market);
  check(/^\d{4}-\d{2}-\d{2}$/.test(s.utc_day), 'Database UTC day required');
  check(s.active_jobs === 0, 'Unresolved pending/running job; inspect manually, never reset');
  check(s.jobs_today === 0, 'A job was already attempted today (UTC); no automatic retry');
  check(Number.isInteger(s.eligible_sources) && s.eligible_sources >= 0, 'Source workload count required');
  return { ...validated, utcDay: s.utc_day,
    expectedRequests: { serpAtMost: 3, scrapeAtMost: s.eligible_sources + 11, openrouterAtMost: 3 },
    limits: 'Conservative workload estimate, not a hard dollar/call cap. Existing rolling manual and provider quotas apply.' };
}

export async function readSnapshot(client) {
  const result = await client.query(`SELECT to_jsonb(p) AS project, to_jsonb(u) AS owner,
    to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS utc_day,
    EXISTS(SELECT 1 FROM project_members m WHERE m.project_id=p.id AND m.user_id=u.id AND m.role='owner') AS owner_member,
    (SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) FROM competitors c WHERE c.project_id=p.id) AS competitors,
    (SELECT COALESCE(jsonb_agg(k), '[]'::jsonb) FROM keywords k WHERE k.project_id=p.id) AS keywords,
    (SELECT count(*)::int FROM scrape_jobs j WHERE j.project_id=p.id AND j.status IN ('pending','running')) AS active_jobs,
    (SELECT count(*)::int FROM scrape_jobs j WHERE j.project_id=p.id
      AND j.created_at >= (date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')) AS jobs_today,
    (SELECT count(*)::int FROM sources s WHERE s.project_id=p.id AND s.domain <> 'instagram.com'
      AND (s.competitor_id IS NOT NULL OR s.created_at > now() - interval '3 days' OR s.cleaned_text IS NULL)) AS eligible_sources
    FROM projects p JOIN users u ON u.id=p.user_id WHERE p.id=$1`, [PIN.project]);
  check(result.rows.length === 1, 'Pinned project missing');
  return result.rows[0];
}

// A session lock spans preflight, the existing durable manual claim, and the
// worker. The claim's pending job blocks retries after crash/restart and its
// owner-row lock preserves the normal account-wide rolling quota decision.
export async function executeDaily({ runMode, client, resolveMarket, claim, worker, emit }) {
  check(['dry-run', 'run'].includes(runMode), 'Invalid execution mode');
  let locked = false;
  try {
    if (runMode === 'run') {
      const result = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked', [LOCK]);
      check(result.rows[0]?.locked === true, 'Another daily demo runner is active');
      locked = true;
    }
    const state = await readSnapshot(client);
    const preflight = validateDaily(state, resolveMarket(state.project.target_market));
    emit({ stage: 'daily-preflight', mode: runMode, ...preflight,
      effectiveModel: PIN.fallback, email: 'disabled', storage: 'disabled', social: 'disabled by pinned empty social inputs' });
    if (runMode === 'dry-run') return 0;
    return await invokeOnce(OWNER, claim, worker, emit);
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [LOCK]);
  }
}

export async function main(args = process.argv.slice(2)) {
  const runMode = mode(args);
  const staging = dotenv.parse(readFileSync(`${envRoot}/.env.staging.local`));
  const providers = dotenv.parse(readFileSync(`${envRoot}/.env`));
  const env = dailyEnvironment(staging, providers);
  const secrets = [staging.DATABASE_URL, env.DATABASE_URL, new URL(env.DATABASE_URL).password,
    decodeURIComponent(new URL(env.DATABASE_URL).password), env.STRIPE_SECRET_KEY, env.SCRAPERAPI_KEY, env.OPENROUTER_API_KEY].filter(Boolean);
  const redact = value => secrets.reduce((text, key) => text.split(key).join('[REDACTED]'), String(value));
  const emit = value => process.stdout.write(`${redact(JSON.stringify(value))}\n`);
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) console[level] = (...values) => process.stderr.write(`${redact(format(...values))}\n`);
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, env);
  // Import drivers/application modules only after removing inherited credentials.
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1, connectionTimeoutMillis: 10000,
    application_name: 'issuefy-isolated-demo-daily' });
  let client;
  try {
    client = await pool.connect();
    // Prevent accidental writes on the default preflight connection.
    if (runMode === 'dry-run') await client.query('SET default_transaction_read_only = on');
    const load = runtime();
    const { resolveMarket } = load('lib/markets.ts');
    // Dry-run does not even load the worker/provider graph.
    return await executeDaily({ runMode, client, resolveMarket, emit,
      claim: runMode === 'run' ? load('lib/entitlement-claims.ts').claimManualRefresh : undefined,
      worker: runMode === 'run' ? load('lib/process-project.ts').processProject : undefined });
  } catch (error) {
    emit({ stage: 'daily-failed', error: error instanceof Error ? error.message : String(error),
      recovery: 'Inspect jobs and logs. Never clear history, quota reservations, or timestamps to retry.' });
    return 1;
  } finally {
    client?.release();
    await pool.end();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(() => {
    process.stderr.write('Daily demo preflight failed: check pinned environment files and configuration.\n');
    process.exitCode = 1;
  });
}
