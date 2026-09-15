const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync, mkdtempSync, existsSync, rmSync } = require('node:fs');
const { resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');
const { loadTs } = require('../helpers/load-ts.cjs');
const pgBin = process.env.ISSUEFY_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const sqlTest = (name, fn) => test(name, { skip: !existsSync(resolve(pgBin, 'postgres')) && 'Set ISSUEFY_TEST_PG_BIN to local PostgreSQL binaries', timeout: 30000 }, fn);
const uid = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
async function setup(t) {
  // Never uses DATABASE_URL. Short private Unix socket path avoids macOS's
  // socket path limit. TCP disabled; all rows and providers are synthetic.
  const dir = mkdtempSync('/tmp/ify-account-');
  let started = false; let pool;
  const run = (command, args) => {
    const result = spawnSync(resolve(pgBin, command), args, { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    const log = result.status !== 0 && existsSync(resolve(dir, 'server.log')) ? readFileSync(resolve(dir, 'server.log'), 'utf8') : '';
    assert.equal(result.status, 0, (result.stderr || result.stdout) + log);
  };
  t.after(async () => {
    if (pool) await pool.end();
    if (started) run('pg_ctl', ['-D', resolve(dir, 'db'), '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  });
  run('initdb', ['-D', resolve(dir, 'db'), '-A', 'trust', '-U', 'postgres', '--no-locale']);
  run('pg_ctl', ['-D', resolve(dir, 'db'), '-l', resolve(dir, 'server.log'), '-o', `-k ${dir} -h '' -F`, '-w', 'start']);
  started = true;
  pool = new Pool({ host: dir, user: 'postgres', database: 'postgres', max: 10 });
  const db = {
    query: (q, v) => pool.query(q, v), exec: q => pool.query(q),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN'); await client.query("SET LOCAL statement_timeout = '5s'");
        const result = await fn(client); await client.query('COMMIT'); return result;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    },
  };
  for (const name of readdirSync(resolve(__dirname, '../../migrations')).filter(n => n.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(resolve(__dirname, '../../migrations', name), 'utf8'));
  }
  await db.query(`INSERT INTO users(id,clerk_user_id,email,name,plan,subscription_status,stripe_customer_id,stripe_subscription_id)
    VALUES($1,'clerk-synthetic','old@example.test','Original','starter','active','cus_synthetic','sub_synthetic')`, [uid]);
  await db.query("INSERT INTO stripe_webhook_events(id,type) VALUES('evt_pending','test')");
  await db.query("INSERT INTO billing_notification_outbox(event_id,kind,recipient,plan) VALUES('evt_pending','canceled','old@example.test','starter')");
  return db;
}
async function isolated(fn) {
  const before = { key: process.env.STRIPE_SECRET_KEY, clerk: process.env.CLERK_SECRET_KEY, data: process.env.BILLING_DATA_ENVIRONMENT, vercel: process.env.VERCEL_ENV };
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_synthetic', CLERK_SECRET_KEY: 'sk_test_synthetic', BILLING_DATA_ENVIRONMENT: 'isolated_test', VERCEL_ENV: 'development' });
  try { await fn(); } finally {
    for (const [name, value] of Object.entries({ STRIPE_SECRET_KEY: before.key, CLERK_SECRET_KEY: before.clerk, BILLING_DATA_ENVIRONMENT: before.data, VERCEL_ENV: before.vercel })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
}
function adapter(db) {
  const fail = {};
  const withTx = fn => db.transaction(client => fn({ query: async (q, v) => {
    if (fail.finish && q.includes("SET phase = 'completed'")) { fail.finish = false; throw Error('synthetic DB failure'); }
    return client.query(q, v);
  } }));
  return { api: loadTs('lib/account-deletion.ts', { '@/lib/db': { withTx }, '@/lib/billing-mode': loadTs('lib/billing-mode.ts') }), fail };
}
function providers() {
  let status = 'trialing'; let exists = true;
  const fail = {}; const calls = [];
  const sub = () => ({ id: 'sub_synthetic', customer: 'cus_synthetic', livemode: false, status, trial_start: 100, trial_end: 200, schedule: null });
  const stripe = {
    customers: { retrieve: async () => ({ id: 'cus_synthetic', livemode: false, metadata: { app_user_id: uid } }) },
    checkout: { sessions: { async *list() {} } },
    subscriptions: { async *list() { yield sub(); }, retrieve: async () => sub(), cancel: async () => { calls.push('cancel'); status = 'canceled'; return sub(); } },
    subscriptionSchedules: { async *list() {} },
  };
  const identity = { async deleteUser() { calls.push('delete-clerk'); if (fail.clerk) throw Error('Clerk synthetic failure'); exists = false; }, async getUser() { return exists ? {} : null; } };
  return { stripe, identity, fail, calls };
}
sqlTest('full migration + actual deletion SQL: pending retains mapping, suppresses mail, prevents resurrection; retry completes', async t => {
  const db = await setup(t); const { api } = adapter(db); const p = providers();
  await db.exec(readFileSync(resolve(__dirname, '../../migrations/0020_account_deletion.sql'), 'utf8')); // additive rerun
  await db.query("INSERT INTO users(id,clerk_user_id,email) VALUES($1,'clerk-other','other@example.test')", [otherId]);
  const ticket = await db.query("INSERT INTO support_tickets(user_id,subject,category) VALUES($1,'Synthetic','billing') RETURNING id", [otherId]);
  await db.query("INSERT INTO support_messages(ticket_id,author_id,author_type,body) VALUES($1,$2,'admin','Preserve this message')", [ticket.rows[0].id, uid]);
  p.fail.clerk = true;
  await isolated(async () => {
    await assert.rejects(api.deleteAccount('clerk-synthetic', p.stripe, p.identity));
    const record = (await db.query("SELECT * FROM account_deletions")).rows[0];
    assert.equal(record.phase, 'billing_closed'); assert.equal(record.trial_used, true); assert.equal(record.stripe_customer_id, 'cus_synthetic');
    assert.equal((await db.query('SELECT * FROM billing_notification_outbox')).rows.length, 0);
    assert.equal((await db.query('SELECT subscription_status FROM users WHERE id=$1', [uid])).rows[0].subscription_status, 'deletion_pending');
    await db.query("UPDATE users SET subscription_status='active', stripe_customer_id='cus_wrong', role='admin' WHERE id=$1", [uid]);
    const protectedUser = (await db.query('SELECT * FROM users WHERE id=$1', [uid])).rows[0];
    assert.equal(protectedUser.subscription_status, 'deletion_pending'); assert.equal(protectedUser.role, 'user'); assert.equal(protectedUser.stripe_customer_id, 'cus_synthetic');
    await assert.rejects(db.query("INSERT INTO users(clerk_user_id,email) VALUES('clerk-synthetic','same@example.test') ON CONFLICT(clerk_user_id) DO UPDATE SET email=excluded.email"), /prevents identity recreation/);
    await assert.rejects(db.query("INSERT INTO billing_checkout_state(user_id,livemode,customer_operation,customer_params) VALUES($1,false,gen_random_uuid(),'{}')", [uid]), /prevents checkout/);
    await db.query("INSERT INTO billing_notification_outbox(event_id,kind,recipient,plan) VALUES('evt_pending','payment_failed','old@example.test','starter')");
    assert.equal((await db.query('SELECT * FROM billing_notification_outbox')).rows.length, 0);
    p.fail.clerk = false;
    assert.deepEqual(await api.deleteAccount('clerk-synthetic', p.stripe, p.identity), { ok: true, status: 'completed' });
    assert.equal((await db.query('SELECT * FROM users WHERE id=$1', [uid])).rows.length, 0);
    assert.equal((await db.query('SELECT author_id FROM support_messages')).rows[0].author_id, null);
    const final = (await db.query('SELECT * FROM account_deletions')).rows[0];
    assert.equal(final.phase, 'completed'); assert.equal(final.checkout_snapshot, null); assert.equal(final.trial_used, true);
    await assert.rejects(db.query("INSERT INTO users(clerk_user_id,email) VALUES('clerk-synthetic','same@example.test')"), /prevents identity recreation/);
    const calls = p.calls.length; await api.deleteAccount('clerk-synthetic', p.stripe, p.identity, false); assert.equal(p.calls.length, calls);
    await assert.rejects(api.deleteAccount('never-requested', p.stripe, p.identity, false), e => e.code === 'deletion_not_requested');
  });
});
sqlTest('final local deletion rollback leaves recoverable tombstone and user, then trusted retry finishes', async t => {
  const db = await setup(t); const { api, fail } = adapter(db); const p = providers(); fail.finish = true;
  await isolated(async () => {
    await assert.rejects(api.deleteAccount('clerk-synthetic', p.stripe, p.identity));
    assert.equal((await db.query('SELECT phase FROM account_deletions')).rows[0].phase, 'identity_deleted');
    assert.equal((await db.query('SELECT id FROM users')).rows.length, 1);
    await api.deleteAccount('clerk-synthetic', p.stripe, p.identity, false);
    assert.equal((await db.query('SELECT id FROM users')).rows.length, 0); assert.deepEqual(p.calls, ['cancel', 'delete-clerk']);
  });
});
sqlTest('concurrent deletion has one owner, and replay does not repeat completed operations', async t => {
  const db = await setup(t); const { api } = adapter(db); const p = providers();
  let release; const gate = new Promise(r => release = r); let entered; const waiting = new Promise(r => entered = r);
  const original = p.identity.deleteUser; p.identity.deleteUser = async () => { entered(); await gate; return original(); };
  await isolated(async () => {
    const first = api.deleteAccount('clerk-synthetic', p.stripe, p.identity); await waiting;
    await assert.rejects(api.deleteAccount('clerk-synthetic', p.stripe, p.identity), e => e.code === 'deletion_busy');
    release(); await first; await api.deleteAccount('clerk-synthetic', p.stripe, p.identity);
    assert.deepEqual(p.calls, ['cancel', 'delete-clerk']);
  });
});
function clerkModule(db, profile) {
  const sent = [];
  const sql = async (strings, ...values) => (await db.query(strings.reduce((text, fragment, i) => text + fragment + (i < values.length ? `$${i + 1}` : ''), ''), values)).rows;
  const module = loadTs('lib/clerk-user.ts', {
    react: { cache: fn => fn }, '@clerk/nextjs/server': { auth: async () => ({ userId: 'clerk-synthetic' }), currentUser: async () => profile },
    './db': { sql, withTx: fn => db.transaction(tx => fn({ query: (q, v) => tx.query(q, v) })) },
    './mailer': { sendWelcomeEmail: async (...args) => { sent.push(args); } },
  });
  return { ...module, sent };
}
const profile = () => ({ id: 'clerk-synthetic', primaryEmailAddressId: 'email1', firstName: 'Clerk', lastName: 'Name', updatedAt: 200,
  emailAddresses: [{ id: 'email1', emailAddress: 'verified@example.test', verification: { status: 'verified' } }] });
sqlTest('verified primary email sync preserves custom name and suppresses stale unsent notices; old profiles cannot revert it', async t => {
  const db = await setup(t); const cu = profile(); const clerk = clerkModule(db, cu);
  const row = await clerk.getOrCreateUser(); assert.equal(row.email, 'verified@example.test'); assert.equal(row.name, 'Original'); assert.equal(clerk.sent.length, 0);
  assert.equal((await db.query('SELECT * FROM billing_notification_outbox')).rows.length, 0);
  cu.updatedAt = 100; cu.emailAddresses[0].emailAddress = 'stale@example.test';
  assert.equal((await clerk.getOrCreateUser()).email, 'verified@example.test');
  cu.updatedAt = 300; cu.emailAddresses[0].verification.status = 'unverified';
  assert.equal((await clerk.getOrCreateUser()).email, 'verified@example.test');
});
sqlTest('new users require verified primary email; concurrent creation sends exactly one welcome', async t => {
  const db = await setup(t); await db.query('DELETE FROM users WHERE id=$1', [uid]); const cu = profile();
  cu.emailAddresses[0].verification.status = 'unverified'; const clerk = clerkModule(db, cu);
  assert.equal((await clerk.requireUser()).status, 403); assert.equal((await db.query('SELECT id FROM users')).rows.length, 0);
  cu.emailAddresses[0].verification.status = 'verified';
  const [a, b] = await Promise.all([clerk.getOrCreateUser(), clerk.getOrCreateUser()]);
  assert.equal(a.id, b.id); assert.equal(clerk.sent.length, 1);
});
sqlTest('pending and completed identities cannot lazily recreate or access user row', async t => {
  const db = await setup(t); const clerk = clerkModule(db, profile());
  await db.query("INSERT INTO account_deletions(clerk_user_id,user_id,livemode) VALUES('clerk-synthetic',$1,false)", [uid]);
  assert.equal((await clerk.requireUser()).status, 410); assert.equal(clerk.sent.length, 0);
  await db.query('DELETE FROM users WHERE id=$1', [uid]);
  await db.query("UPDATE account_deletions SET phase='completed'");
  assert.equal((await clerk.requireUser()).status, 410); assert.equal((await db.query('SELECT id FROM users')).rows.length, 0);
});

sqlTest('actual checkout advisory lock blocks deletion before tombstone or provider effects', async t => {
  const db = await setup(t); const { api } = adapter(db); const p = providers();
  let release; const gate = new Promise(r => release = r); let ready; const acquired = new Promise(r => ready = r);
  const lock = db.transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`ify:checkout:false:${uid}`]); ready(); await gate;
  });
  await acquired;
  await isolated(async () => {
    try {
      await assert.rejects(api.deleteAccount('clerk-synthetic', p.stripe, p.identity), e => e.code === 'checkout_busy');
      assert.equal((await db.query('SELECT * FROM account_deletions')).rows.length, 0); assert.equal(p.calls.length, 0);
    } finally { release(); await lock; }
    await api.deleteAccount('clerk-synthetic', p.stripe, p.identity); assert.deepEqual(p.calls, ['cancel', 'delete-clerk']);
  });
});
sqlTest('identity inserted during deletion lookup requires retry with its checkout lock', async t => {
  const db = await setup(t); const { api } = adapter(db); const p = providers();
  await db.query('DELETE FROM users WHERE id=$1', [uid]);
  let release; const gate = new Promise(r => release = r); let ready; const acquired = new Promise(r => ready = r);
  const registration = db.transaction(async client => {
    await client.query("INSERT INTO users(id,clerk_user_id,email) VALUES($1,'clerk-synthetic','new@example.test')", [uid]); ready(); await gate;
  });
  await acquired;
  await isolated(async () => {
    const deletion = api.deleteAccount('clerk-synthetic', p.stripe, p.identity);
    const rejected = assert.rejects(deletion, e => e.code === 'deletion_busy');
    try {
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        const rows = await db.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT pg_advisory_xact_lock%' LIMIT 1");
        if (rows.rows.length) { waiting = true; break; }
        await new Promise(r => setTimeout(r, 10));
      }
      assert.equal(waiting, true);
    } finally { release(); await registration; }
    await rejected;
    assert.equal((await db.query('SELECT * FROM account_deletions')).rows.length, 0); assert.equal(p.calls.length, 0);
    await api.deleteAccount('clerk-synthetic', p.stripe, p.identity); assert.deepEqual(p.calls, ['delete-clerk']);
  });
});
sqlTest('ambiguous legacy recipient blocks deletion instead of deleting another account notice', async t => {
  const db = await setup(t); const { api } = adapter(db); const p = providers();
  await db.query("INSERT INTO users(id,clerk_user_id,email) VALUES($1,'clerk-other','old@example.test')", [otherId]);
  await db.query("UPDATE billing_notification_outbox SET account_user_id=NULL");
  await isolated(async () => {
    await assert.rejects(api.deleteAccount('clerk-synthetic', p.stripe, p.identity), e => e.code === 'notification_reconciliation_required');
    assert.equal((await db.query('SELECT * FROM billing_notification_outbox')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM account_deletions')).rows.length, 0); assert.equal(p.calls.length, 0);
  });
});

sqlTest('webhook attribution suppresses a deleted account notice without suppressing another account sharing its email', async t => {
  const db = await setup(t); const { api } = adapter(db); const p = providers();
  await db.query('DELETE FROM billing_notification_outbox');
  await db.query(`INSERT INTO users(id,clerk_user_id,email,plan,subscription_status,stripe_customer_id,stripe_subscription_id)
    VALUES($1,'clerk-other','old@example.test','starter','active','cus_other','sub_other')`, [otherId]);
  p.fail.clerk = true;
  await isolated(async () => {
    await assert.rejects(api.deleteAccount('clerk-synthetic', p.stripe, p.identity));
    const { processBillingEvent } = loadTs('lib/billing/webhook.ts');
    const subscription = (id, customer) => ({ id, customer, livemode: false, status: 'canceled', created: 100,
      cancel_at_period_end: false, items: { data: [{ price: { id: 'price_starter' }, current_period_end: 300 }] } });
    const deleted = subscription('sub_synthetic', 'cus_synthetic');
    const other = subscription('sub_other', 'cus_other');
    const apply = (eventId, sub) => processBillingEvent({ id: eventId, type: 'customer.subscription.deleted', livemode: false, data: { object: sub } }, {
      transaction: fn => db.transaction(fn), retrieveSubscription: async () => sub, planFromPriceId: () => 'starter',
    });
    await apply('evt_deleted_owner', deleted);
    assert.equal((await db.query("SELECT * FROM billing_notification_outbox WHERE event_id='evt_deleted_owner'")).rows.length, 0);
    await apply('evt_other_owner', other);
    const notices = (await db.query("SELECT * FROM billing_notification_outbox WHERE event_id='evt_other_owner'")).rows;
    assert.equal(notices.length, 1); assert.equal(notices[0].account_user_id, otherId);
    assert.equal(notices[0].recipient, 'old@example.test');
  });
});
