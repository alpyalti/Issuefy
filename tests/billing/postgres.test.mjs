import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

// Optional SQL smoke test, isolated in WASM memory. No DATABASE_URL is read.
// BILLING_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js
const modulePath = process.env.BILLING_PGLITE_MODULE;
test('additive migration and atomic billing SQL run in disposable PostgreSQL', { skip: !modulePath }, async () => {
  const { PGlite } = await import(pathToFileURL(modulePath).href);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users (id text PRIMARY KEY, email text, plan text, updated_at timestamptz);
      INSERT INTO users VALUES ('user_1', 'test@example.invalid', 'starter', now());`);
    await db.exec(await fs.readFile(new URL('../../migrations/0005_stripe.sql', import.meta.url), 'utf8'));
    const migration = await fs.readFile(new URL('../../migrations/0016_billing_webhook_completion.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.exec('ALTER TABLE billing_notification_outbox ADD COLUMN account_user_id text');
    await db.exec('CREATE TABLE account_deletions (user_id text, stripe_customer_id text, livemode boolean)');
    await db.exec("UPDATE users SET stripe_customer_id = 'cus_1', stripe_subscription_id = 'sub_1', subscription_status = 'active'");
    const source = await fs.readFile(new URL('../../lib/billing/webhook.ts', import.meta.url), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
    const { processBillingEvent, deliverBillingNotifications } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
    const sub = { id: 'sub_1', customer: 'cus_1', status: 'active', created: 100, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_growth' }, current_period_end: 300 }] } };
    const deps = { transaction: fn => db.transaction(fn), retrieveSubscription: async () => sub, planFromPriceId: () => 'growth' };
    const event = { id: 'evt_1', type: 'customer.subscription.updated', data: { object: sub } };
    await db.exec(`CREATE FUNCTION reject_billing() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected DB failure'; END $$;
      CREATE TRIGGER reject_billing BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION reject_billing();`);
    await assert.rejects(processBillingEvent(event, deps), /injected DB failure/);
    assert.equal((await db.query('SELECT * FROM stripe_webhook_events')).rows.length, 0);
    await db.exec('DROP TRIGGER reject_billing ON users');
    assert.equal(await processBillingEvent(event, deps), 'processed');
    assert.equal(await processBillingEvent(event, deps), 'duplicate');
    assert.equal((await db.query('SELECT plan FROM users')).rows[0].plan, 'growth');
    assert.equal((await db.query('SELECT * FROM billing_notification_outbox')).rows.length, 1);
    let sends = 0;
    await deliverBillingNotifications('evt_1', deps.transaction, async () => { sends++; });
    await deliverBillingNotifications('evt_1', deps.transaction, async () => { sends++; });
    assert.equal(sends, 1);
  } finally { await db.close(); }
});
