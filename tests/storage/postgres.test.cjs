const { test } = require('node:test');
const fs = require('node:fs');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { resolve, join } = require('node:path');
const { tmpdir } = require('node:os');
const { Client } = require('pg');
const { loadTs } = require('../helpers/load-ts.cjs');
const root = resolve(__dirname, '../..');
const bin = process.env.ISSUEFY_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';
// No connection URLs or environment files: all connections use a fresh private
// Unix socket; all S3 requests use an explicit stub. Nothing reaches R2/Neon.
const env = { PATH: '/usr/bin:/bin', LC_ALL: 'C' };
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const key = n => `raw/${uuid(1)}/${uuid(n)}.html`;
function run(name, args) {
    const result = cp.spawnSync(join(bin, name), args, { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.stdout);
}
test('retention citations, concurrent attachment, immutable cleanup and expired analysis on disposable PostgreSQL', { timeout: 60000 }, async () => {
    assert.ok(fs.existsSync(join(bin, 'postgres')), 'Set ISSUEFY_TEST_PG_BIN to local PostgreSQL binaries');
    let dir, running = false, c;
    const originalEnv = { ...process.env };
    const previousUmask = process.umask(0o077);
    try {
        dir = fs.mkdtempSync(join(tmpdir(), 'ify-retention-'));
        run('initdb', ['-D', dir + '/db', '-A', 'trust', '-U', 'postgres', '--no-locale']);
        run('pg_ctl', ['-D', dir + '/db', '-l', dir + '/server.log', '-o', `-k ${dir} -h '' -F`, '-w', 'start']);
        running = true;
        c = new Client({ host: dir, user: 'postgres', database: 'postgres' });
        await c.connect();
        for (const f of fs.readdirSync(root + '/migrations').filter(f => f.endsWith('.sql')).sort())
            await c.query(fs.readFileSync(root + '/migrations/' + f, 'utf8'));
        const u = (await c.query("INSERT INTO users(clerk_user_id,email) VALUES('synthetic_local','local@example.invalid') RETURNING id")).rows[0].id;
        await c.query("INSERT INTO projects(id,user_id,name,industry,business_type,target_market) VALUES($1,$2,'QA','Software','SaaS','GLOBAL')", [uuid(1), u]);
        async function source(n) { await c.query("INSERT INTO sources(id,project_id,title,url,domain,source_type,cleaned_text,prior_cleaned_text,r2_raw_html_key,scraped_at) VALUES($1,$2,'Citation',$3,'example.invalid','Other','bulky','prior',$4,now()-interval '40 days')", [uuid(n), uuid(1), 'https://example.invalid/' + n, key(n)]); }
        await source(10);
        await source(11);
        await source(12);
        const brief = (await c.query("INSERT INTO daily_summaries(project_id,summary_date,summary_text) VALUES($1,current_date,'Synthetic brief') RETURNING id", [uuid(1)])).rows[0].id;
        await c.query('INSERT INTO daily_summary_sources(daily_summary_id,source_id) VALUES($1,$2)', [brief, uuid(12)]);
        const signal = (await c.query("INSERT INTO signals(project_id,title,category,description,importance) VALUES($1,'QA','Competitor Move','QA','Low') RETURNING id", [uuid(1)])).rows[0].id;
        await c.query('INSERT INTO signal_sources(signal_id,source_id) VALUES($1,$2)', [signal, uuid(10)]);
        const withTx = async (fn) => { await c.query('BEGIN'); try {
            const r = await fn(c);
            await c.query('COMMIT');
            return r;
        }
        catch (e) {
            await c.query('ROLLBACK');
            throw e;
        } };
        const sql = async (strings, ...values) => (await c.query(strings.reduce((s, x, i) => s + (i ? '$' + i : '') + x, ''), values)).rows;
        const retention = loadTs('lib/source-retention.ts', { './db': { withTx } });
        assert.deepEqual(await retention.expireSourceContent(), { deleted: 1, compacted: 2 });
        const kept = (await c.query('SELECT title,cleaned_text,r2_raw_html_key FROM sources WHERE id=$1', [uuid(10)])).rows[0];
        assert.deepEqual(kept, { title: 'Citation', cleaned_text: null, r2_raw_html_key: null });
        assert.equal((await c.query('SELECT count(*)::int n FROM signal_sources')).rows[0].n, 1);
        Object.assign(process.env, { R2_ENABLED: 'true', R2_ACCOUNT_ID: 'synthetic', R2_ACCESS_KEY_ID: 'synthetic', R2_SECRET_ACCESS_KEY: 'synthetic', R2_BUCKET: 'synthetic' });
        let sent = [];
        let attach = false, attachRejected = false, failSend = false;
        class Command {
            constructor(input) { this.input = input; }
        }
        class S3Client {
            async send(cmd) { if (cmd.input.Body !== undefined)
                assert.equal((await c.query('SELECT available_at>now() delayed FROM storage_cleanup_jobs WHERE object_key=$1', [cmd.input.Key])).rows[0].delayed, true); if (attach) {
                attach = false;
                try {
                    await c.query('UPDATE sources SET r2_raw_html_key=$1 WHERE id=$2', [cmd.input.Key, uuid(10)]);
                }
                catch {
                    attachRejected = true;
                }
            } sent.push(cmd.input.Key); if (failSend)
                throw Error("synthetic provider failure"); }
            destroy() { }
        }
        const storage = loadTs('lib/storage.ts', { './db': { requireSql: () => sql }, './env': { configuredEnv: v => v }, '@aws-sdk/client-s3': { S3Client, PutObjectCommand: Command, DeleteObjectCommand: Command } });
        assert.equal((await c.query('SELECT count(*)::int n FROM storage_cleanup_jobs')).rows[0].n, 3);
        attach = true;
        await storage.drainStorageCleanup();
        const live = (await c.query('SELECT r2_raw_html_key FROM sources WHERE id=$1', [uuid(10)])).rows[0].r2_raw_html_key;
        const race = sent.includes(live);
        assert.equal(race, false);
        assert.equal(attachRejected, true);
        assert.equal((await c.query('SELECT count(*)::int n FROM storage_cleanup_jobs WHERE completed_at IS NOT NULL')).rows[0].n, 3);
        await assert.rejects(c.query('UPDATE sources SET r2_raw_html_key=$1 WHERE id=$2', [key(11), uuid(10)]), /Cannot attach/);
        // A committed citation holds the source FK lock while retention skips it.
        const b = new Client({ host: dir, user: 'postgres', database: 'postgres' });
        await b.connect();
        try {
            await source(20);
            await b.query('BEGIN');
            await b.query('INSERT INTO signal_sources(signal_id,source_id) VALUES($1,$2)', [signal, uuid(20)]);
            assert.deepEqual(await retention.expireSourceContent(), { deleted: 0, compacted: 0 });
            await b.query('COMMIT');
            assert.deepEqual(await retention.expireSourceContent(), { deleted: 0, compacted: 1 });
            // Attachment winning the queue row lock makes cleanup skip that orphan.
            await c.query("INSERT INTO storage_cleanup_jobs(object_key) VALUES($1)", [key(30)]);
            await b.query('BEGIN');
            await b.query('UPDATE sources SET r2_raw_html_key=$1 WHERE id=$2', [key(30), uuid(10)]);
            const beforeCalls = sent.length;
            await storage.drainStorageCleanup();
            assert.equal(sent.includes(key(30)), false);
            await b.query('COMMIT');
            assert.equal((await c.query('SELECT count(*)::int n FROM storage_cleanup_jobs WHERE object_key=$1', [key(30)])).rows[0].n, 0);
            // Failed upload still leaves its delayed orphan reservation.
            failSend = true;
            assert.equal(await storage.archiveRawHtml(key(91), 'synthetic'), null);
            failSend = false;
            assert.equal((await c.query('SELECT count(*)::int n FROM storage_cleanup_jobs WHERE object_key=$1', [key(91)])).rows[0].n, 1);
            const reserved = await storage.archiveRawHtml(key(31), 'synthetic');
            assert.equal(reserved, key(31));
            assert.equal((await c.query('SELECT available_at>now() delayed FROM storage_cleanup_jobs WHERE object_key=$1', [key(31)])).rows[0].delayed, true);
            // Replacement preserves old cleanup and consumes the new reservation.
            await c.query('UPDATE sources SET r2_raw_html_key=$1 WHERE id=$2', [key(31), uuid(10)]);
            assert.equal((await c.query('SELECT count(*)::int n FROM storage_cleanup_jobs WHERE object_key=$1', [key(30)])).rows[0].n, 1);
            assert.equal((await c.query('SELECT count(*)::int n FROM storage_cleanup_jobs WHERE object_key=$1', [key(31)])).rows[0].n, 0);
            // Version expiry fences even a previously claimed result; refreshed current
            // source does not keep an old captured version alive.
            await source(40);
            await c.query("UPDATE sources SET cleaned_text=repeat('x',250),content_hash='version40' WHERE id=$1", [uuid(40)]);
            const analysis = loadTs('lib/source-analysis.ts', { './db': { withTx }, './usage': loadTs('lib/usage.ts') });
            const claimed = await analysis.claimAnalysis(uuid(1), 8);
            assert.equal(claimed.versions.length, 1);
            await c.query('UPDATE sources SET scraped_at=now() WHERE id=$1', [uuid(40)]);
            await retention.expireSourceContent();
            const expired = (await c.query('SELECT expired_at,cleaned_text,claim_token FROM source_analysis_versions WHERE id=$1', [claimed.versions[0].id])).rows[0];
            assert.ok(expired.expired_at);
            assert.equal(expired.cleaned_text, null);
            assert.equal(expired.claim_token, null);
            const finish = await analysis.finishAnalysis(uuid(1), claimed.token, new Map([[claimed.versions[0].id, [{ title: 'Must not publish', description: 'stale', category: 'Competitor Move', importance: 'Low', confidence_score: 80 }]]]), 20);
            assert.equal(finish.inserted, 0);
            assert.equal(finish.finalized, 0);
            await source(41);
            await c.query("UPDATE sources SET created_at=now()-interval '100 days',scraped_at=now(),cleaned_text=repeat('y',250),content_hash='version41' WHERE id=$1", [uuid(41)]);
            await retention.expireSourceContent();
            const fresh = (await c.query('SELECT expired_at,cleaned_text FROM source_analysis_versions WHERE source_id=$1', [uuid(41)])).rows[0];
            assert.equal(fresh.expired_at, null);
            assert.equal(fresh.cleaned_text.length, 250);
            await c.query('DELETE FROM users WHERE id=$1', [u]);
            assert.equal((await c.query('SELECT count(*)::int n FROM storage_cleanup_jobs WHERE object_key=$1', [key(31)])).rows[0].n, 1);
            // Live leases defer retries; expired leases are reclaimed.
            await c.query("UPDATE storage_cleanup_jobs SET lease_until=now()+interval '5 minutes' WHERE object_key=$1", [key(31)]);
            const priorLeaseCalls = sent.filter(k => k === key(31)).length;
            await storage.drainStorageCleanup();
            assert.equal(sent.filter(k => k === key(31)).length, priorLeaseCalls);
            const countBefore = sent.filter(k => k === key(31)).length;
            await c.query("UPDATE storage_cleanup_jobs SET lease_until=now()-interval '1 second' WHERE object_key=$1", [key(31)]);
            await storage.drainStorageCleanup();
            assert.equal(sent.filter(k => k === key(31)).length, countBefore + 1);
        }
        finally {
            await b.query('ROLLBACK').catch(() => { });
            await b.end();
        }
        await c.query('INSERT INTO storage_cleanup_jobs(object_key) VALUES($1)', [key(90)]);
        failSend = true;
        assert.equal((await storage.drainStorageCleanup()).failed, 1);
        failSend = false;
        const retry = (await c.query('SELECT cleanup_started_at,completed_at,lease_token,available_at>now() backedoff FROM storage_cleanup_jobs WHERE object_key=$1', [key(90)])).rows[0];
        assert.ok(retry.cleanup_started_at);
        assert.equal(retry.completed_at, null);
        assert.equal(retry.lease_token, null);
        assert.equal(retry.backedoff, true);
        await c.query('UPDATE storage_cleanup_jobs SET available_at=now() WHERE object_key=$1', [key(90)]);
        assert.equal((await storage.drainStorageCleanup()).deleted, 1);
    }
    finally {
        for (const name of Object.keys(process.env))
            delete process.env[name];
        Object.assign(process.env, originalEnv);
        if (c)
            await c.end();
        if (running)
            run('pg_ctl', ['-D', dir + '/db', '-m', 'immediate', '-w', 'stop']);
        if (dir)
            fs.rmSync(dir, { recursive: true, force: true });
        process.umask(previousUmask);
    }
});
