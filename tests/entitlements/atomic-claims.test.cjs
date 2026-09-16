const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');
const { Pool } = require('pg');

function load(file, mocks) {
  const code = ts.transpileModule(readFileSync(resolve(__dirname, '../..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, Response, Date, Map, Set, console,
    process: { env: { BETA_STARTER_LIMITS: 'false' } },
    require: name => { if (!(name in mocks)) throw new Error(`Unmocked dependency ${name}`); return mocks[name]; },
  });
  return exports;
}

// Never accepts DATABASE_URL: launch a private, disposable local server with
// Unix sockets only. CI can set ISSUEFY_TEST_PG_BIN to its installed PG bin dir.
const pgBin = process.env.ISSUEFY_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
test('atomic entitlement claims with concurrent PostgreSQL transactions', {
  skip: !existsSync(join(pgBin, 'postgres')) ? 'Set ISSUEFY_TEST_PG_BIN to local PostgreSQL binaries' : false,
}, async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ify-quota-'));
  const run = (exe, args) => {
    const result = spawnSync(join(pgBin, exe), args, { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  let started = false;
  let pool;
  try {
    run('initdb', ['-D', join(dir, 'db'), '-A', 'trust', '-U', 'postgres', '--no-locale']);
    run('pg_ctl', ['-D', join(dir, 'db'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -h '' -F`, '-w', 'start']);
    started = true;
    pool = new Pool({ host: dir, user: 'postgres', database: 'postgres', max: 8 });
    // Real production DDL for the relevant tables and constraints.
    const schema = readFileSync(resolve(__dirname, '../../migrations/0001_init.sql'), 'utf8');
    for (const table of ['users', 'projects', 'scrape_jobs']) {
      const ddl = schema.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`))[0];
      await pool.query(ddl);
    }
    await pool.query(readFileSync(resolve(__dirname, '../../migrations/0009_team_seats.sql'), 'utf8'));
    await pool.query(`ALTER TABLE projects ADD COLUMN is_active boolean NOT NULL DEFAULT true;
      ALTER TABLE users ADD COLUMN email_brief_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN email_brief_unsubscribe_token text`);
    const withTx = async fn => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL statement_timeout = '5s'");
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    };
    const api = load('lib/api.ts', { zod: {}, './db': {} });
    const claims = load('lib/entitlement-claims.ts', { './db': { withTx }, './usage': load('lib/usage.ts', {}), './api': api });
    async function fixture(plan = 'growth') {
      const owner = randomUUID();
      await pool.query('INSERT INTO users (id, clerk_user_id, email, plan) VALUES ($1::uuid,$1::text,$2,$3)', [owner, `${owner}@test.invalid`, plan]);
      const projects = [];
      for (let i = 0; i < 2; i++) {
        const id = randomUUID(); projects.push(id);
        await pool.query("INSERT INTO projects (id,user_id,name,industry,business_type,target_market) VALUES ($1,$2,'Test','Test','Test','Test')", [id, owner]);
        await pool.query("INSERT INTO project_members (project_id,user_id,role) VALUES ($1,$2,'owner')", [id, owner]);
      }
      return { owner, projects };
    }
    async function user(email) {
      const id = randomUUID();
      await pool.query('INSERT INTO users (id,clerk_user_id,email) VALUES ($1::uuid,$1::text,$2)', [id, email]);
      return id;
    }
    async function behindOwnerLock(owner, operations) {
      const blocker = await pool.connect();
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [owner]);
      const pending = operations.map(fn => fn());
      try {
        // Verify actual lock waits on distinct PG sessions before releasing.
        let waiting = 0;
        for (let i = 0; i < 100; i++) {
          const r = await pool.query("SELECT COUNT(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
          waiting = r.rows[0].n;
          if (waiting >= operations.length) break;
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.equal(waiting, operations.length, 'concurrent callers must wait on owner lock');
      } finally { await blocker.query('COMMIT'); blocker.release(); }
      return Promise.all(pending);
    }

    await t.test('same-project refresh admits one and persists one pending job', async () => {
      const f = await fixture();
      const results = await behindOwnerLock(f.owner, [1,2].map(() => () => claims.claimManualRefresh(f.owner, f.projects[0], false)));
      assert.equal(results.filter(r => r.jobId).length, 1);
      assert.equal(results.find(r => r instanceof Response).status, 429);
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM scrape_jobs WHERE project_id=$1', [f.projects[0]])).rows[0].n, 1);
    });
    await t.test('account refresh cap includes pre-worker reservations across projects', async () => {
      const f = await fixture('starter');
      const results = await behindOwnerLock(f.owner, f.projects.map(p => () => claims.claimManualRefresh(f.owner, p, false)));
      assert.equal(results.filter(r => r.jobId).length, 1);
      assert.equal(results.find(r => r instanceof Response).status, 429);
      // Simulate a crashed/failed attempt: it remains counted.
      await pool.query("UPDATE scrape_jobs SET status='failed' WHERE id=$1", [results.find(r => r.jobId).jobId]);
      assert.equal((await claims.claimManualRefresh(f.owner, f.projects[1], false)).status, 429);
    });
    await t.test('paused refresh remains a successful no-op with no quota reservation', async () => {
      const f = await fixture();
      await pool.query('UPDATE projects SET is_active=false WHERE id=$1', [f.projects[0]]);
      const response = await claims.claimManualRefresh(f.owner, f.projects[0], false);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).jobId, 'skipped-paused');
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM scrape_jobs WHERE project_id=$1', [f.projects[0]])).rows[0].n, 0);
    });
    await t.test('daily count includes historical jobs; admin bypass retained', async () => {
      const f = await fixture('starter');
      await pool.query("INSERT INTO scrape_jobs(project_id,status,job_type) VALUES($1,'completed','manual')", [f.projects[0]]);
      assert.equal((await claims.claimManualRefresh(f.owner, f.projects[1], false)).status, 429);
      assert.ok((await claims.claimManualRefresh(f.owner, f.projects[1], true)).jobId);
    });
    await t.test('cooldown update failure rolls back job reservation', async () => {
      const f = await fixture();
      await pool.query(`CREATE FUNCTION fail_cooldown() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cooldown failure'; END $$`);
      await pool.query('CREATE TRIGGER fail_cooldown BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION fail_cooldown()');
      try { await assert.rejects(claims.claimManualRefresh(f.owner, f.projects[0], false), /injected/); }
      finally { await pool.query('DROP TRIGGER fail_cooldown ON projects'); }
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM scrape_jobs WHERE project_id=$1', [f.projects[0]])).rows[0].n, 0);
      assert.equal((await pool.query('SELECT last_manual_refresh_at FROM projects WHERE id=$1', [f.projects[0]])).rows[0].last_manual_refresh_at, null);
    });
    await t.test('actual refresh route and worker consume one reserved row; stage failure stays counted', async () => {
      const f = await fixture('starter');
      const sql = async (strings, ...values) => {
        const query = strings.reduce((text, part, i) => text + (i ? `$${i}` : '') + part, '');
        // Force an execution failure at the first pipeline stage, after claim
        // consumption, to exercise real worker failure finalization without providers.
        if (query.includes('FROM keywords')) throw new Error('injected stage failure');
        return (await pool.query(query, values)).rows;
      };
      const workerMocks = {};
      const source = readFileSync(resolve(__dirname, '../../lib/process-project.ts'), 'utf8');
      for (const [, name] of source.matchAll(/from ["']([^"']+)["']/g)) {
        workerMocks[name] = new Proxy({}, { get: () => () => { throw new Error('unexpected provider call'); } });
      }
      workerMocks['./db'] = { requireSql: () => sql, withTx };
      workerMocks['./usage'] = load('lib/usage.ts', {});
      workerMocks['./markets'] = { resolveMarket: () => ({ matched: true }) };
      workerMocks['./sentry'] = { captureError() {}, captureBreadcrumb() {} };
      workerMocks['@/lib/billing-gate'] = { ensureProjectWorkerSubscription: async () => {} };
      const worker = load('lib/process-project.ts', workerMocks);
      const routeMocks = {
        '@/lib/clerk-user': { requireUser: async () => ({ id: f.owner }) },
        '@/lib/billing-gate': { ensureProjectSubscriptionApi: async () => ({ ownerId: f.owner, plan: 'starter' }) },
        '@/lib/admin': { isAdmin: async () => false }, '@/lib/db': { requireSql: () => sql },
        '@/lib/api': load('lib/api.ts', { zod: {}, './db': { sql } }),
        '@/lib/entitlement-claims': claims, '@/lib/process-project': worker, '@/lib/sentry': { captureError() {} },
      };
      const route = load('app/api/projects/[id]/refresh/route.ts', routeMocks);
      const response = await route.POST(new Request('https://test'), { params: Promise.resolve({ id: f.projects[0] }) });
      const body = await response.json();
      assert.equal(body.status, 'failed');
      const jobs = await pool.query('SELECT id,status FROM scrape_jobs WHERE project_id=$1', [f.projects[0]]);
      assert.equal(jobs.rows.length, 1);
      assert.equal(jobs.rows[0].id, body.jobId);
      assert.equal(jobs.rows[0].status, 'failed');
      await assert.rejects(worker.processProject(f.projects[0], 'manual', body.jobId), /claim already consumed/);
      assert.equal((await claims.claimManualRefresh(f.owner, f.projects[1], false)).status, 429);

      // Failure before the worker consumes its pending reservation is finalized
      // by the actual route too, without deleting its quota record.
      const another = await fixture('starter');
      routeMocks['@/lib/clerk-user'] = { requireUser: async () => ({ id: another.owner }) };
      workerMocks['@/lib/billing-gate'] = { ensureProjectWorkerSubscription: async () => { throw new Error('owner lapsed'); } };
      routeMocks['@/lib/process-project'] = load('lib/process-project.ts', workerMocks);
      const failed = await load('app/api/projects/[id]/refresh/route.ts', routeMocks).POST(new Request('https://test'), { params: Promise.resolve({ id: another.projects[0] }) });
      assert.equal(failed.status, 500);
      assert.equal((await pool.query('SELECT status FROM scrape_jobs WHERE project_id=$1', [another.projects[0]])).rows[0].status, 'failed');
    });

    await t.test('last invitation seat across projects admits only one', async () => {
      const f = await fixture();
      const existing = await user('existing@test.invalid');
      await pool.query("INSERT INTO project_members(project_id,user_id,role) VALUES($1,$2,'editor')", [f.projects[0], existing]);
      const results = await behindOwnerLock(f.owner, f.projects.map((p,i) => () => claims.reserveInvitation(f.owner,p,`invite-${i}@test.invalid`,'editor')));
      assert.equal(results.filter(r => r.invite).length, 1);
      assert.equal(results.find(r => r instanceof Response).status, 409);
    });
    await t.test('same-email invitation checks serialize even with two seats free', async () => {
      const f = await fixture();
      const results = await behindOwnerLock(f.owner, ['SAME@test.invalid','same@test.invalid'].map(email => () => claims.reserveInvitation(f.owner,f.projects[0],email,'viewer')));
      assert.equal(results.filter(r => r.invite).length, 1);
      assert.equal(results.find(r => r instanceof Response).status, 409);
    });
    await t.test('acceptance and creation preserve reserved seat total', async () => {
      const f = await fixture();
      const email = 'accept@test.invalid'; const member = await user(email);
      const invitation = await claims.reserveInvitation(f.owner,f.projects[0],email,'editor');
      await claims.reserveInvitation(f.owner,f.projects[1],'reserved@test.invalid','viewer');
      const results = await behindOwnerLock(f.owner, [
        () => claims.acceptInvitation(invitation.invite.token,member,email),
        () => claims.reserveInvitation(f.owner,f.projects[1],'extra@test.invalid','viewer'),
      ]);
      assert.equal(results[0].projectId,f.projects[0]);
      assert.equal(results[1].status,409);
    });
    await t.test('cancellation holding token lock wins over acceptance', async () => {
      const f = await fixture(); const email='cancel@test.invalid'; const member=await user(email);
      const { invite } = await claims.reserveInvitation(f.owner,f.projects[0],email,'editor');
      const cancel=await pool.connect(); await cancel.query('BEGIN');
      await cancel.query('UPDATE project_invitations SET canceled_at=now() WHERE id=$1',[invite.id]);
      const accepting=claims.acceptInvitation(invite.token,member,email);
      // A separate session sees the token update only after its lock releases.
      let waiting = false;
      for (let i=0; i<100; i++) {
        const r=await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'");
        if(r.rows.length) { waiting=true; break; }
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      assert.equal(waiting,true,'acceptance waits on cancellation token lock');
      await cancel.query('COMMIT'); cancel.release();
      assert.equal((await accepting).status,409);
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM project_members WHERE user_id=$1',[member])).rows[0].n,0);
    });
    await t.test('token stamp failure rolls back membership and leaves invitation claimable', async () => {
      const f=await fixture(); const email='retry@test.invalid'; const member=await user(email);
      const {invite}=await claims.reserveInvitation(f.owner,f.projects[0],email,'editor');
      await pool.query(`CREATE FUNCTION fail_accept() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected accept failure'; END $$`);
      await pool.query('CREATE TRIGGER fail_accept BEFORE UPDATE ON project_invitations FOR EACH ROW EXECUTE FUNCTION fail_accept()');
      try { await assert.rejects(claims.acceptInvitation(invite.token,member,email),/injected/); }
      finally { await pool.query('DROP TRIGGER fail_accept ON project_invitations'); }
      assert.equal((await pool.query('SELECT COUNT(*)::int n FROM project_members WHERE user_id=$1',[member])).rows[0].n,0);
      assert.equal((await claims.acceptInvitation(invite.token,member,email)).projectId,f.projects[0]);
      assert.equal((await claims.acceptInvitation(invite.token,member,email)).status,409);
    });
  } finally {
    if(pool) await pool.end();
    if(started) run('pg_ctl',['-D',join(dir,'db'),'-m','immediate','-w','stop']);
    rmSync(dir,{recursive:true,force:true});
  }
});
