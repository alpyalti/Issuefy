const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, readdirSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const vm = require('node:vm');
const ts = require('typescript');
const { Pool, Client } = require('pg');

// Only binaries/source paths are configurable. Never read DATABASE_URL, .env,
// PGHOST, or provider credentials. Both application adapters connect exclusively
// to a server created here with no TCP listener, using a fresh Unix socket.
const pgBin = process.env.ISSUEFY_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
const root = resolve(process.env.ISSUEFY_BILLING_TEST_SOURCE_ROOT || resolve(__dirname, '../..'));
function load(file, mocks = {}) {
  const filename = join(root, file);
  const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${code}\n})`, {
    process: { env: { STRIPE_SECRET_KEY: 'sk_test_fixture', BILLING_DATA_ENVIRONMENT: 'isolated_test' } },
    Date, console,
  })(name => {
    if (name === 'node:crypto') return { randomUUID };
    if (Object.hasOwn(mocks, name)) return mocks[name];
    throw new Error(`Unmocked dependency ${name}`);
  }, module, module.exports);
  return module.exports;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, message) {
  const end = Date.now() + 5000;
  do { if (await fn()) return; await pause(10); } while (Date.now() < end);
  assert.fail(message);
}
function gate() {
  let release; const waiting = new Promise(resolve => { release = resolve; });
  return { waiting, release };
}
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));

test('billing migrations and multi-client transactions on disposable PostgreSQL 17', {
  skip: !existsSync(join(pgBin, 'postgres')) ? 'Set ISSUEFY_TEST_PG_BIN to PostgreSQL 17 binaries' : false,
  timeout: 60000,
}, async t => {
  assert.ok(existsSync(join(root, 'migrations/0018_billing_checkout.sql')), 'Run on integrated source including migration 0018');
  const dir = mkdtempSync(join(tmpdir(), 'ify-bill-'));
  const run = (exe, args) => {
    const result = spawnSync(join(pgBin, exe), args, {
      encoding: 'utf8', timeout: 15000,
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  let started = false; let pool;
  try {
    run('initdb', ['-D', join(dir, 'db'), '-A', 'trust', '-U', 'postgres', '--no-locale']);
    started = true; // Attempt shutdown even if pg_ctl reports a startup timeout.
    run('pg_ctl', ['-D', join(dir, 'db'), '-l', join(dir, 'server.log'), '-o', `-k ${dir} -h '' -F`, '-w', 'start']);
    const local = { host: dir, port: 5432, user: 'postgres', password: 'disposable-fixture-only', database: 'postgres', ssl: false, options: '-c statement_timeout=8000',
      application_name: 'ify-billing-test', connectionTimeoutMillis: 5000, statement_timeout: 8000 };
    pool = new Pool({ ...local, max: 12 });
    const version = (await pool.query('SHOW server_version_num')).rows[0].server_version_num;
    assert.equal(Math.floor(Number(version) / 10000), 17, 'PostgreSQL 17 required');
    assert.equal((await pool.query('SHOW listen_addresses')).rows[0].listen_addresses, '');
    const { runMigrations } = await import(pathToFileURL(join(root, 'scripts/migrate.mjs')).href);
    // Exercise the real migration runner, but its Client cannot use any supplied
    // connection URL. An isolated env/cwd prevents loading the application's env.
    class LocalClient extends Client { constructor() { super(local); } }
    const logs = [];
    const migrate = () => runMigrations({ cwd: dir,
      env: { DATABASE_URL: 'postgresql://unused.invalid/disposable' }, ClientClass: LocalClient,
      migrationsDir: join(root, 'migrations'), logger: { log: (...args) => logs.push(args.join(' ')), error: message => logs.push(message) },
    });
    const expectedFiles = readdirSync(join(root, 'migrations')).filter(f => f.endsWith('.sql')).sort();
    for (let n = 1; n <= 16; n++) assert.ok(expectedFiles.some(f => f.startsWith(String(n).padStart(4, '0') + '_')));
    assert.ok(expectedFiles.some(f => f.startsWith('0018_')));
    assert.ok(expectedFiles.some(f => f.startsWith('0020_')), 'Webhook requires deletion migration 0020');
    await t.test('complete migration chain applies once; concurrent reruns preserve history/data', async () => {
      assert.equal(await migrate(), 0, logs.join('\n'));
      const before = (await pool.query('SELECT filename,applied_at FROM _migrations ORDER BY filename')).rows;
      assert.deepEqual(before.map(r => r.filename), expectedFiles);
      const sentinel = randomUUID();
      await pool.query('INSERT INTO users(id,clerk_user_id,email) VALUES($1,$2,$3)', [sentinel, sentinel, 'preserve@test.invalid']);
      assert.deepEqual(await Promise.all([migrate(), migrate()]), [0, 0]);
      assert.deepEqual((await pool.query('SELECT filename,applied_at FROM _migrations ORDER BY filename')).rows, before);
      assert.equal((await pool.query('SELECT email FROM users WHERE id=$1', [sentinel])).rows[0].email, 'preserve@test.invalid');
      assert.ok(logs.some(line => line.includes('no pending migrations')));
    });

    const withTx = async fn => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const value = await fn(client);
        await client.query('COMMIT'); return value;
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    };
    // Checkout intentionally uses independent autocommitted statements for its
    // operation journal while a separate transaction holds the advisory lock.
    const sql = { query: async (statement, values) => (await pool.query(statement, values)).rows };
    const webhook = load('lib/billing/webhook.ts');
    const checkout = load('lib/billing-checkout.ts', {
      '@/lib/db': { withTx, requireSql: () => sql }, '@/lib/billing-mode': load('lib/billing-mode.ts'),
    });
    const input = { plan: 'starter', billing: 'monthly', priceId: 'price_starter', appUrl: 'https://example.invalid' };
    async function fixture(mapped = true) {
      const id = randomUUID(); const customer = `cus_${id}`; const subscription = `sub_${id}`;
      const user = { id, clerk_user_id: id, email: `${id}@test.invalid`, name: 'Test' };
      await pool.query(`INSERT INTO users(id,clerk_user_id,email,stripe_customer_id,stripe_subscription_id,subscription_status)
        VALUES($1,$2,$3,$4,$5,$6)`, [id, id, user.email, mapped ? customer : null, mapped ? subscription : null, mapped ? 'active' : null]);
      const sub = { id: subscription, customer, livemode: false, status: 'active', created: 100, trial_start: null, trial_end: null,
        cancel_at_period_end: false, items: { data: [{ price: { id: 'price_growth' }, current_period_end: 300 }] } };
      const event = (eventId = `evt_${randomUUID()}`) => ({ id: eventId, livemode: false, type: 'customer.subscription.updated', data: { object: sub } });
      const deps = { transaction: withTx, retrieveSubscription: async () => structuredClone(sub), planFromPriceId: () => 'growth' };
      return { user, customer, sub, event, deps };
    }
    async function waitingLocks(minimum = 1) {
      await until(async () => (await pool.query("SELECT count(*)::int n FROM pg_stat_activity WHERE application_name='ify-billing-test' AND wait_event_type='Lock'")).rows[0].n >= minimum,
        `Expected ${minimum} distinct PostgreSQL sessions waiting on locks`);
    }
    async function blockAccount(user, operations, inspect = async () => {}) {
      const blocker = await pool.connect();
      let pending = [];
      try {
        await blocker.query('BEGIN');
        await blocker.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
        pending = operations.map(fn => outcome(fn()));
        await waitingLocks(operations.length);
        await inspect();
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      return Promise.all(pending);
    }
    async function failureTrigger(table, when = '') {
      await pool.query(`CREATE OR REPLACE FUNCTION billing_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected billing failure'; END $$`);
      await pool.query(`CREATE TRIGGER billing_test_fail BEFORE INSERT OR UPDATE ON ${table} FOR EACH ROW ${when} EXECUTE FUNCTION billing_test_fail()`);
      return () => pool.query(`DROP TRIGGER billing_test_fail ON ${table}`);
    }

    await t.test('simultaneous duplicate webhooks wait on real locks and apply once', async () => {
      const f = await fixture(); const event = f.event(); let reads = 0;
      f.deps.retrieveSubscription = async () => { reads++; return f.sub; };
      const results = await blockAccount(f.user, [1, 2].map(() => () => webhook.processBillingEvent(event, f.deps)), async () => assert.equal(reads, 0));
      assert.deepEqual(results.map(r => r.value).sort(), ['duplicate', 'processed']);
      assert.equal(reads, 1);
      assert.equal((await pool.query('SELECT count(*)::int n FROM billing_notification_outbox WHERE event_id=$1', [event.id])).rows[0].n, 1);
      assert.ok((await pool.query('SELECT completed_at FROM stripe_webhook_events WHERE id=$1', [event.id])).rows[0].completed_at);
    });
    await t.test('failed in-flight webhook rolls back and releases duplicate to recover', async () => {
      const f = await fixture(); const event = f.event(); const hold = gate(); let reads = 0;
      f.deps.retrieveSubscription = async () => {
        reads++;
        if (reads === 1) { await hold.waiting; throw new Error('mock Stripe read failed'); }
        return f.sub;
      };
      const first = outcome(webhook.processBillingEvent(event, f.deps)); let second;
      try {
        await until(() => reads === 1, 'first webhook holds its uncommitted receipt');
        second = outcome(webhook.processBillingEvent(event, f.deps));
        await waitingLocks(); assert.equal(reads, 1);
      } finally { hold.release(); }
      assert.match((await first).error.message, /mock Stripe read failed/);
      assert.equal((await second).value, 'processed'); assert.equal(reads, 2);
      assert.equal((await pool.query('SELECT plan FROM users WHERE id=$1', [f.user.id])).rows[0].plan, 'growth');
      assert.equal((await pool.query('SELECT count(*)::int n FROM billing_notification_outbox WHERE event_id=$1', [event.id])).rows[0].n, 1);
    });
    await t.test('different events serialize current-state retrieval after account lock', async () => {
      const f = await fixture(); let reads = 0;
      f.deps.retrieveSubscription = async () => { reads++; return f.sub; };
      const results = await blockAccount(f.user, [1, 2].map(() => () => webhook.processBillingEvent(f.event(), f.deps)), async () => {
        assert.equal(reads, 0); f.sub.status = 'canceled';
      });
      assert.ok(results.every(r => r.value === 'processed')); assert.equal(reads, 2);
      assert.equal((await pool.query('SELECT subscription_status FROM users WHERE id=$1', [f.user.id])).rows[0].subscription_status, 'canceled');
      assert.equal((await pool.query('SELECT count(*)::int n FROM billing_notification_outbox WHERE recipient=$1', [f.user.email])).rows[0].n, 1);
    });
    for (const table of ['users', 'billing_notification_outbox', 'stripe_webhook_events']) {
      await t.test(`PostgreSQL ${table} failure rolls back receipt/effects and permits retry`, async () => {
        const f = await fixture(); const event = f.event();
        const drop = await failureTrigger(table, table === 'stripe_webhook_events' ? 'WHEN (NEW.completed_at IS NOT NULL)' : '');
        try { await assert.rejects(webhook.processBillingEvent(event, f.deps), /injected billing failure/); }
        finally { await drop(); }
        assert.equal((await pool.query('SELECT plan FROM users WHERE id=$1', [f.user.id])).rows[0].plan, 'starter');
        assert.equal((await pool.query('SELECT count(*)::int n FROM stripe_webhook_events WHERE id=$1', [event.id])).rows[0].n, 0);
        assert.equal((await pool.query('SELECT count(*)::int n FROM billing_notification_outbox WHERE event_id=$1', [event.id])).rows[0].n, 0);
        assert.equal(await webhook.processBillingEvent(event, f.deps), 'processed');
        assert.equal((await pool.query('SELECT plan FROM users WHERE id=$1', [f.user.id])).rows[0].plan, 'growth');
      });
    }
    await t.test('concurrent outbox drains serialize and retry email failure without rebilling', async () => {
      const f = await fixture(); const event = f.event(); await webhook.processBillingEvent(event, f.deps);
      await assert.rejects(webhook.deliverBillingNotifications(event.id, withTx, async () => { throw new Error('mock mail failed'); }), /mock mail/);
      const hold = gate(); let sends = 0;
      const send = async () => { sends++; await hold.waiting; };
      const first = outcome(webhook.deliverBillingNotifications(event.id, withTx, send));
      let second;
      try {
        await until(() => sends === 1, 'first outbox sender entered');
        second = outcome(webhook.deliverBillingNotifications(event.id, withTx, send));
        await waitingLocks(); assert.equal(sends, 1);
      } finally { hold.release(); }
      const results = await Promise.all([first, second]); assert.ok(results.every(r => !r.error));
      assert.equal(sends, 1); assert.equal(await webhook.processBillingEvent(event, f.deps), 'duplicate');
      assert.ok((await pool.query('SELECT sent_at FROM billing_notification_outbox WHERE event_id=$1', [event.id])).rows[0].sent_at);
    });

    async function markDeleting(client, f, phase = 'pending', live = false) {
      // Same relevant transaction order as deleteAccount initialization: user
      // lock, marker insertion, attributed outbox cleanup, pending user status.
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [f.user.id]);
      await client.query(`INSERT INTO account_deletions(clerk_user_id,user_id,livemode,phase,stripe_customer_id)
        VALUES($1,$2,$3,$4,$5)`, [f.user.clerk_user_id, f.user.id, live, phase, f.customer]);
      await client.query('DELETE FROM billing_notification_outbox WHERE account_user_id=$1 AND sent_at IS NULL', [f.user.id]);
      await client.query("UPDATE users SET subscription_status='deletion_pending' WHERE id=$1", [f.user.id]);
    }
    await t.test('completed deletion acknowledges late customer event without provider or user recreation', async () => {
      const f = await fixture(); const event = f.event();
      await withTx(async client => {
        await markDeleting(client, f, 'completed');
        await client.query('DELETE FROM users WHERE id=$1', [f.user.id]);
      });
      f.deps.retrieveSubscription = async () => { throw new Error('Unexpected provider call'); };
      assert.equal(await webhook.processBillingEvent(event, f.deps), 'processed');
      assert.equal(await webhook.processBillingEvent(event, f.deps), 'duplicate');
      assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE id=$1', [f.user.id])).rows[0].n, 0);
      assert.equal((await pool.query('SELECT count(*)::int n FROM billing_notification_outbox WHERE event_id=$1', [event.id])).rows[0].n, 0);
    });
    await t.test('deletion initialization wins race; blocked webhook sees marker before provider read', async () => {
      const f = await fixture(); const client = await pool.connect(); const event = f.event(); let pending;
      f.deps.retrieveSubscription = async () => { throw new Error('Unexpected provider call'); };
      try {
        await client.query('BEGIN'); await markDeleting(client, f);
        pending = outcome(webhook.processBillingEvent(event, f.deps));
        await waitingLocks();
        await client.query('COMMIT');
      } finally { await client.query('ROLLBACK'); client.release(); }
      assert.equal((await pending).value, 'processed');
      assert.equal((await pool.query('SELECT subscription_status,plan FROM users WHERE id=$1', [f.user.id])).rows[0].subscription_status, 'deletion_pending');
      assert.equal((await pool.query('SELECT plan FROM users WHERE id=$1', [f.user.id])).rows[0].plan, 'starter');
      assert.equal((await pool.query('SELECT count(*)::int n FROM billing_notification_outbox WHERE event_id=$1', [event.id])).rows[0].n, 0);
    });
    await t.test('deletion finish locks marker then user while webhook races without inverse-lock deadlock', async () => {
      const f = await fixture(); await withTx(client => markDeleting(client, f, 'identity_deleted'));
      const client = await pool.connect(); const event = f.event(); let pending;
      f.deps.retrieveSubscription = async () => { throw new Error('Unexpected provider call'); };
      try {
        await client.query('BEGIN');
        await client.query('SELECT * FROM account_deletions WHERE user_id=$1 FOR UPDATE', [f.user.id]);
        await client.query('DELETE FROM users WHERE id=$1', [f.user.id]);
        pending = outcome(webhook.processBillingEvent(event, f.deps));
        await waitingLocks();
        await client.query("UPDATE account_deletions SET phase='completed',completed_at=now() WHERE user_id=$1", [f.user.id]);
        await client.query('COMMIT');
      } finally { await client.query('ROLLBACK'); client.release(); }
      assert.equal((await pending).value, 'processed');
      assert.equal((await pool.query('SELECT count(*)::int n FROM users WHERE id=$1', [f.user.id])).rows[0].n, 0);
    });
    await t.test('shared email has explicit outbox ownership; deletion removes only its own mail and suppresses future events', async () => {
      const f = await fixture(); const other = await fixture(); const hold = gate(); let reading = false;
      await pool.query('UPDATE users SET email=$1 WHERE id=$2', [f.user.email, other.user.id]);
      await webhook.processBillingEvent(other.event(), other.deps);
      f.deps.retrieveSubscription = async () => { reading = true; await hold.waiting; return f.sub; };
      const updating = outcome(webhook.processBillingEvent(f.event(), f.deps)); let deletion;
      try {
        await until(() => reading, 'webhook locked account before deletion');
        deletion = outcome(withTx(client => markDeleting(client, f, 'billing_closed')));
        await waitingLocks();
      } finally { hold.release(); }
      assert.equal((await updating).value, 'processed'); assert.ok(!(await deletion).error);
      const rows = (await pool.query('SELECT account_user_id FROM billing_notification_outbox WHERE recipient=$1', [f.user.email])).rows;
      assert.deepEqual(rows.map(row => row.account_user_id), [other.user.id]);
      const late = f.event(); f.sub.status = 'canceled';
      f.deps.retrieveSubscription = async () => { throw new Error('Unexpected provider call'); };
      assert.equal(await webhook.processBillingEvent(late, f.deps), 'processed');
      assert.equal((await pool.query('SELECT count(*)::int n FROM billing_notification_outbox WHERE event_id=$1', [late.id])).rows[0].n, 0);
    });
    await t.test('unknown missing user and wrong-mode tombstone do not consume receipt', async () => {
      const f = await fixture(); const event = f.event();
      await pool.query('DELETE FROM users WHERE id=$1', [f.user.id]);
      await assert.rejects(webhook.processBillingEvent(event, f.deps), /mapping unavailable/);
      await pool.query(`INSERT INTO account_deletions(clerk_user_id,user_id,livemode,phase,stripe_customer_id)
        VALUES($1,$2,true,'completed',$3)`, [f.user.clerk_user_id, f.user.id, f.customer]);
      await assert.rejects(webhook.processBillingEvent(event, f.deps), /mode mismatch/);
      assert.equal((await pool.query('SELECT count(*)::int n FROM stripe_webhook_events WHERE id=$1', [event.id])).rows[0].n, 0);
    });

    function stripe(f) {
      const customers = new Map(); const sessions = new Map(); const keys = new Map();
      const counts = { customer: 0, session: 0 }; const hooks = {};
      const customer = { id: f.customer, livemode: false, metadata: { app_user_id: f.user.id } };
      customers.set(f.customer, customer);
      const api = {
        customers: {
          create: async (params, options) => {
            counts.customer++; if (hooks.customer) await hooks.customer();
            if (!keys.has(options.idempotencyKey)) keys.set(options.idempotencyKey, customer);
            return keys.get(options.idempotencyKey);
          },
          retrieve: async id => { assert.ok(customers.has(id)); return customers.get(id); },
        },
        subscriptions: {
          retrieve: async id => { assert.equal(id, f.sub.id); return f.sub; },
          list: async function* () { if (hooks.subscribed) yield f.sub; },
        },
        checkout: { sessions: {
          list: async function* () { for (const session of sessions.values()) yield session; },
          retrieve: async id => { assert.ok(sessions.has(id)); return sessions.get(id); },
          create: async (params, options) => {
            counts.session++;
            if (!keys.has(options.idempotencyKey)) {
              const session = { id: `cs_${randomUUID()}`, customer: params.customer, livemode: false, mode: 'subscription', status: 'open', metadata: params.metadata, url: 'https://checkout.example.invalid/session' };
              keys.set(options.idempotencyKey, session); sessions.set(session.id, session);
            }
            if (hooks.session) await hooks.session();
            return keys.get(options.idempotencyKey);
          },
        } },
      };
      return { api, counts, hooks, sessions, keys };
    }
    await t.test('advisory lock rejects concurrent first checkout; later retry reuses journal/session', async () => {
      const f = await fixture(false); const s = stripe(f); const hold = gate();
      s.hooks.customer = () => hold.waiting;
      const first = outcome(checkout.createBillingCheckout(s.api, f.user, input));
      try {
        await until(() => s.counts.customer === 1, 'first checkout holds advisory lock at provider');
        assert.ok((await pool.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND granted")).rows.length);
        await assert.rejects(checkout.createBillingCheckout(s.api, f.user, input), error => error.code === 'checkout_busy');
        assert.equal(s.counts.customer, 1);
      } finally { hold.release(); }
      assert.ok((await first).value);
      await checkout.createBillingCheckout(s.api, f.user, input);
      assert.equal(s.counts.customer, 1); assert.equal(s.counts.session, 1);
      assert.equal((await pool.query('SELECT stripe_customer_id FROM users WHERE id=$1', [f.user.id])).rows[0].stripe_customer_id, f.customer);
      assert.equal((await pool.query('SELECT count(*)::int n FROM billing_checkout_state WHERE user_id=$1', [f.user.id])).rows[0].n, 1);
    });
    await t.test('checkout DB failure preserves autocommitted operation key across lock rollback', async () => {
      const f = await fixture(false); const s = stripe(f); const drop = await failureTrigger('users');
      try { await assert.rejects(checkout.createBillingCheckout(s.api, f.user, input), /injected billing failure/); }
      finally { await drop(); }
      const state = (await pool.query('SELECT * FROM billing_checkout_state WHERE user_id=$1', [f.user.id])).rows[0];
      assert.equal(state.customer_id, f.customer);
      assert.equal((await pool.query('SELECT stripe_customer_id FROM users WHERE id=$1', [f.user.id])).rows[0].stripe_customer_id, null);
      await checkout.createBillingCheckout(s.api, f.user, input);
      const retried = (await pool.query('SELECT * FROM billing_checkout_state WHERE user_id=$1', [f.user.id])).rows[0];
      assert.equal(retried.customer_operation, state.customer_operation); assert.equal(s.counts.customer, 1); assert.equal(s.counts.session, 1);
    });
    await t.test('session-stamp failure recovers provider session without issuing another checkout', async () => {
      const f = await fixture(false); const s = stripe(f);
      const drop = await failureTrigger('billing_checkout_state', 'WHEN (NEW.session_id IS NOT NULL)');
      try { await assert.rejects(checkout.createBillingCheckout(s.api, f.user, input), /injected billing failure/); }
      finally { await drop(); }
      const state = (await pool.query('SELECT * FROM billing_checkout_state WHERE user_id=$1', [f.user.id])).rows[0];
      assert.ok(state.session_operation); assert.equal(state.session_id, null); assert.equal(s.sessions.size, 1);
      await checkout.createBillingCheckout(s.api, f.user, input);
      assert.equal(s.counts.session, 1);
      const saved = (await pool.query('SELECT * FROM billing_checkout_state WHERE user_id=$1', [f.user.id])).rows[0];
      assert.equal(saved.session_operation, state.session_operation); assert.ok(saved.session_id);
    });
    await t.test('webhook row lock and checkout advisory/journal connections converge without duplicate subscription', async () => {
      const f = await fixture(); const s = stripe(f); s.hooks.subscribed = true;
      const hold = gate(); let reading = false;
      f.deps.retrieveSubscription = async () => { reading = true; await hold.waiting; return f.sub; };
      const updating = outcome(webhook.processBillingEvent(f.event(), f.deps)); let purchasing;
      try {
        await until(() => reading, 'webhook holds account row lock');
        purchasing = outcome(checkout.createBillingCheckout(s.api, f.user, input));
        await waitingLocks();
        assert.equal(s.counts.session, 0);
      } finally { hold.release(); }
      assert.equal((await updating).value, 'processed');
      assert.equal((await purchasing).error.code, 'subscription_exists');
      assert.equal(s.counts.customer, 0); assert.equal(s.counts.session, 0);
      assert.equal((await pool.query('SELECT plan FROM users WHERE id=$1', [f.user.id])).rows[0].plan, 'growth');
    });
  } finally {
    if (pool) await pool.end();
    if (started && existsSync(join(dir, 'db/postmaster.pid'))) {
      run('pg_ctl', ['-D', join(dir, 'db'), '-m', 'immediate', '-w', 'stop']);
    }
    // If shutdown fails, retain the cluster directory rather than unlinking
    // files beneath a running server. The test fails and reports that failure.
    rmSync(dir, { recursive: true, force: true });
  }
});
