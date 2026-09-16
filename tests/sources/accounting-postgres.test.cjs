const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { join, isAbsolute } = require('node:path');
const { execFileSync } = require('node:child_process');
const { loadTs } = require('../helpers/load-ts.cjs');

test('source accounting is atomic in disposable PostgreSQL', { timeout: 60000 }, async (t) => {
  const pgBin = process.env.ISSUEFY_TEST_PG_BIN;
  assert.ok(pgBin && isAbsolute(pgBin), 'Set ISSUEFY_TEST_PG_BIN to an absolute PostgreSQL 17 binary directory');
  const run = (binary, args) => execFileSync(join(pgBin, binary), args, { stdio: 'ignore', timeout: 15000, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' } });
  const root = mkdtempSync(join('/tmp', 'ify007-'));
  const data = join(root, 'data');
  let pool;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--no-locale', '-E', 'UTF8']);
    run('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h '' -k ${root} -p 55488`, '-w', 'start']);
    const { Pool } = require('pg');
    pool = new Pool({ host: root, port: 55488, database: 'postgres', user: 'postgres', password: 'disposable-fixture-only', ssl: false, options: '-c statement_timeout=8000', application_name: 'ify-source-test', connectionTimeoutMillis: 5000, statement_timeout: 8000 });
    assert.equal(Math.floor(Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num) / 10000), 17);
    assert.equal((await pool.query('SHOW listen_addresses')).rows[0].listen_addresses, '');
    await pool.query(`CREATE TABLE projects(id uuid PRIMARY KEY,user_id uuid NOT NULL);
      CREATE TABLE usage_counters(user_id uuid NOT NULL,period_start date NOT NULL,sources_stored int NOT NULL DEFAULT 0,updated_at timestamptz DEFAULT now(),PRIMARY KEY(user_id,period_start));
      CREATE TABLE sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES projects(id),title text NOT NULL,url text NOT NULL,cleaned_text text,prior_cleaned_text text,content_hash text,last_changed_at timestamptz,competitor_id uuid,keyword_id uuid,domain text,source_type text,scraped_at timestamptz,content_snippet text,r2_raw_html_key text,UNIQUE(project_id,url));`);
    const project = '00000000-0000-4000-8000-000000000001';
    const owner = '00000000-0000-4000-8000-000000000002';
    await pool.query('INSERT INTO projects VALUES($1,$2)', [project,owner]);
    const { upsertSource } = loadTs('lib/sources.ts', {
      './db': { requireSql: () => async (strings,...values) => (await pool.query(strings.reduce((q,s,i)=>q+(i?'$'+i:'')+s,''),values)).rows },
      './url-normalize': loadTs('lib/url-normalize.ts'),
    });
    const put = (url, extra={}) => upsertSource({ projectId:project,title:'Source',url:'https://example.org/'+url,sourceType:'Article',...extra });
    const count = async () => Number((await pool.query('SELECT COALESCE(sum(sources_stored),0) AS n FROM usage_counters')).rows[0].n);
    await t.test('metadata insert counts once; refresh and first scrape do not count again', async () => {
      assert.equal((await put('one')).inserted,true);
      assert.equal((await put('one/')).inserted,false);
      assert.equal((await put('one',{cleanedText:'Fresh content.'})).inserted,false);
      assert.equal(await count(),1);
      const row=(await pool.query("SELECT *, date_trunc('month',statement_timestamp() AT TIME ZONE 'UTC')::date = period_start AS correct_period FROM usage_counters")).rows[0];
      assert.equal(row.user_id,owner); assert.equal(row.correct_period,true);
    });
    await t.test('scraped new source counts; changed refresh does not', async () => {
      await put('two',{cleanedText:'Initial.'}); await put('two',{cleanedText:'Changed.'});
      assert.equal(await count(),2);
    });
    await t.test('concurrent conflict inserts count exactly once', async () => {
      const results=await Promise.all(Array.from({length:12},()=>put('concurrent')));
      assert.equal(results.filter(r=>r.inserted).length,1); assert.equal(await count(),3);
      await Promise.all(Array.from({length:8},(_,i)=>put('distinct-'+i)));
      assert.equal(await count(),11);
    });
    await t.test('counter failure rolls back source insertion', async () => {
      await pool.query('ALTER TABLE usage_counters ADD CONSTRAINT fail_fixture CHECK(sources_stored <= 11)');
      await assert.rejects(put('rollback'));
      assert.equal((await pool.query("SELECT count(*) AS n FROM sources WHERE url LIKE '%rollback'")).rows[0].n,'0');
      assert.equal(await count(),11);
      // Conflict refresh remains legal when no further accounting is possible.
      assert.equal((await put('one',{title:'Refreshed'})).inserted,false);
      await pool.query('ALTER TABLE usage_counters DROP CONSTRAINT fail_fixture');
    });
    await t.test('source constraint failure leaves accounting unchanged', async () => {
      await assert.rejects(put('bad',{projectId:'00000000-0000-4000-8000-000000000099'}));
      assert.equal(await count(),11);
    });
  } finally {
    if(pool) await pool.end();
    try { run('pg_ctl',['-D',data,'-m','immediate','-w','stop']); } catch {}
    rmSync(root,{recursive:true,force:true});
  }
});
