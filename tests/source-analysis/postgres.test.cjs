const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash, randomUUID } = require('node:crypto');
const { loadTs } = require('../helpers/load-ts.cjs');

test('disposable PostgreSQL: versions, fair claims, retries, atomic dedup and cap continuation', { skip: process.env.RUN_LOCAL_ANALYSIS_DB !== '1' }, async (t) => {
  // Always create our own socket-only database. No DATABASE_URL or external DB.
  const root = mkdtempSync(join(tmpdir(), 'ify010-'));
  const data = join(root, 'data');
  let pool;
  try {
    execFileSync('initdb', ['-D', data, '-A', 'trust', '--no-locale', '-E', 'UTF8'], { stdio: 'ignore' });
    execFileSync('pg_ctl', ['-D', data, '-l', join(root, 'postgres.log'), '-o', `-h '' -k ${root} -p 55487`, '-w', 'start'], { stdio: 'ignore' });
    const { Pool } = require('pg');
    pool = new Pool({ host: root, port: 55487, database: 'postgres', user: process.env.USER });
    await pool.query(`CREATE TABLE projects(id uuid PRIMARY KEY);
      CREATE TABLE sources(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES projects(id),title text NOT NULL,url text NOT NULL,cleaned_text text,prior_cleaned_text text,content_hash text,last_changed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),competitor_id uuid,keyword_id uuid,domain text,source_type text,scraped_at timestamptz NOT NULL DEFAULT now(),content_snippet text,r2_raw_html_key text,UNIQUE(project_id,url));
      CREATE TABLE signals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL,title text,category text,description text,importance text,confidence_score int,suggested_action text,created_at timestamptz DEFAULT now());
      CREATE TABLE signal_sources(signal_id uuid REFERENCES signals(id) ON DELETE CASCADE,source_id uuid REFERENCES sources(id),UNIQUE(signal_id,source_id));`);
    await pool.query(readFileSync(join(__dirname, '../../migrations/0022_source_analysis_versions.sql'), 'utf8'));
    const withTx = async (fn) => { const c = await pool.connect(); try { await c.query('BEGIN'); const result = await fn(c); await c.query('COMMIT'); return result; } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); } };
    const helper = loadTs('lib/source-analysis.ts', { './db': { withTx } });
    const project = '00000000-0000-4000-8000-000000000001';
    await pool.query('INSERT INTO projects VALUES($1)', [project]);
    const hash = (text) => createHash('sha256').update(text).digest('hex');
    async function add(text = 'Source initial content. '.repeat(12)) {
      return (await pool.query('INSERT INTO sources(project_id,title,url,cleaned_text,content_hash) VALUES($1,$2,$3,$4,$5) RETURNING id', [project, 'Source', 'https://example.org/news/'+randomUUID(), text, hash(text)])).rows[0].id;
    }
    const ids = [];
    for (let i = 0; i < 12; i++) ids.push(await add());
    await t.test('unchanged/metadata updates enqueue once, successive changes retain intermediate text', async () => {
      await pool.query('UPDATE sources SET title=$2 WHERE id=$1', [ids[0], 'Rediscovered']);
      assert.equal(Number((await pool.query('SELECT count(*) FROM source_analysis_versions')).rows[0].count), 12);
      for (const text of ['Second version. '.repeat(20), 'Third version. '.repeat(20)]) {
        await pool.query('UPDATE sources SET prior_cleaned_text=cleaned_text,cleaned_text=$2,content_hash=$3,last_changed_at=now() WHERE id=$1', [ids[0], text, hash(text)]);
      }
      const rows = (await pool.query('SELECT content_revision,cleaned_text FROM source_analysis_versions WHERE source_id=$1 ORDER BY content_revision', [ids[0]])).rows;
      assert.equal(rows.length, 3); assert.ok(rows[1].cleaned_text.startsWith('Second')); assert.ok(rows[2].cleaned_text.startsWith('Third'));
    });
    await t.test('concurrent claims are disjoint; ninth and later versions progress after empty results', async () => {
      const [a,b] = await Promise.all([helper.claimAnalysis(project,8), helper.claimAnalysis(project,8)]);
      assert.equal(a.versions.length+b.versions.length,14);
      assert.equal(new Set([...a.versions,...b.versions].map((v)=>v.id)).size,14);
      for (const c of [a,b]) await helper.finishAnalysis(project,c.token,new Map(c.versions.map((v)=>[v.id,[]])),20);
      assert.equal((await helper.claimAnalysis(project,8)).versions.length,0);
    });
    let source;
    const signal = (id, title='Acme pricing') => ({ source_id:id,title,category:'Competitor Move',description:'Acme changed its offer.',importance:'Medium',confidence_score:80,suggested_action:'' });
    await t.test('failed attempt retries; expired worker cannot publish after reclaim', async () => {
      source=await add('Retry source. '.repeat(20));
      const old=await helper.claimAnalysis(project,8);
      await helper.releaseAnalysis(old.token);
      assert.equal((await helper.claimAnalysis(project,8)).versions.length,0);
      await pool.query('UPDATE source_analysis_versions SET available_at=now() WHERE source_id=$1',[source]);
      const expired=await helper.claimAnalysis(project,8);
      await pool.query("UPDATE source_analysis_versions SET lease_until=now()-interval '1 second' WHERE claim_token=$1",[expired.token]);
      const fresh=await helper.claimAnalysis(project,8);
      assert.equal((await helper.finishAnalysis(project,expired.token,new Map([[expired.versions[0].id,[signal(expired.versions[0].id)]]]),20)).inserted,0);
      assert.equal((await helper.finishAnalysis(project,old.token,new Map([[old.versions[0].id,[signal(old.versions[0].id)]]]),20)).inserted,0);
      await helper.finishAnalysis(project,fresh.token,new Map([[fresh.versions[0].id,[signal(fresh.versions[0].id),signal(fresh.versions[0].id)]]]),20);
      assert.equal(Number((await pool.query('SELECT count(*) FROM signals')).rows[0].count),1);
    });
    await t.test('same normalized event in another revision is skipped, fingerprints survive signal expiration', async () => {
      const text='Retry source new footer. '.repeat(20);
      await pool.query('UPDATE sources SET cleaned_text=$2,content_hash=$3 WHERE id=$1',[source,text,hash(text)]);
      await pool.query('DELETE FROM signals');
      const c=await helper.claimAnalysis(project,8);
      const result=await helper.finishAnalysis(project,c.token,new Map([[c.versions[0].id,[signal(c.versions[0].id,' ACME   PRICING ')]]]),20);
      assert.equal(result.inserted,0); assert.equal(result.duplicates,1);
    });
    await t.test('daily cap caches remainder; next claim consumes it without model rerun', async () => {
      await add('Cap source. '.repeat(20));
      const c=await helper.claimAnalysis(project,8), v=c.versions[0];
      const out=await helper.finishAnalysis(project,c.token,new Map([[v.id,[signal(v.id,'One'),signal(v.id,'Two')]]]),1);
      assert.equal(out.inserted,1);
      const row=(await pool.query('SELECT * FROM source_analysis_versions WHERE id=$1',[v.id])).rows[0];
      assert.equal(row.completed_at,null); assert.equal(row.result_index,1); assert.equal(row.result_signals.length,2);
      await pool.query("UPDATE signals SET created_at=now()-interval '1 day'; UPDATE source_analysis_versions SET available_at=now() WHERE completed_at IS NULL");
      const next=await helper.claimAnalysis(project,8);
      assert.ok(next.versions[0].result_signals);
      assert.equal((await helper.finishAnalysis(project,next.token,new Map(),1)).inserted,1);
    });
    await t.test('expired rows are unclaimable and same-hash rehydration never requeues', async () => {
      const text='Expiring content. '.repeat(20), id=await add(text);
      await pool.query('UPDATE source_analysis_versions SET expired_at=now(),cleaned_text=NULL,prior_cleaned_text=NULL,result_signals=NULL WHERE source_id=$1',[id]);
      await pool.query('UPDATE sources SET cleaned_text=NULL WHERE id=$1',[id]);
      await pool.query('UPDATE sources SET cleaned_text=$2 WHERE id=$1',[id,text]);
      assert.equal(Number((await pool.query('SELECT count(*) FROM source_analysis_versions WHERE source_id=$1',[id])).rows[0].count),1);
      assert.equal((await helper.claimAnalysis(project,8)).versions.length,0);
    });
    await t.test('publication failure rolls back signals, fingerprints and completion together', async () => {
      await add('Rollback source. '.repeat(20));
      const c=await helper.claimAnalysis(project,8), v=c.versions[0];
      await pool.query("ALTER TABLE signal_sources ADD CONSTRAINT fail_fixture CHECK(false) NOT VALID");
      const before=Number((await pool.query('SELECT count(*) FROM signals')).rows[0].count);
      await assert.rejects(helper.finishAnalysis(project,c.token,new Map([[v.id,[signal(v.id,'Rollback')]]]),20));
      assert.equal(Number((await pool.query('SELECT count(*) FROM signals')).rows[0].count),before);
      assert.equal((await pool.query('SELECT completed_at FROM source_analysis_versions WHERE id=$1',[v.id])).rows[0].completed_at,null);
      await pool.query('ALTER TABLE signal_sources DROP CONSTRAINT fail_fixture');
    });
    await t.test('claim expiring while waiting for project lock cannot publish', async () => {
      await add('Lock wait source. '.repeat(20));
      const c=await helper.claimAnalysis(project,8), v=c.versions[0];
      const blocker=await pool.connect();
      try {
        await blocker.query('BEGIN'); await blocker.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[project]);
        await pool.query("UPDATE source_analysis_versions SET lease_until=clock_timestamp()+interval '50 milliseconds' WHERE claim_token=$1",[c.token]);
        const finishing=helper.finishAnalysis(project,c.token,new Map([[v.id,[signal(v.id,'Expired while waiting')]]]),20);
        await new Promise((resolve)=>setTimeout(resolve,100));
        await blocker.query('COMMIT');
        assert.equal((await finishing).inserted,0);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
    });
    await t.test('actual source upsert preserves snapshot/snippet on failed metadata rediscovery', async () => {
      const upsert = loadTs('lib/sources.ts', { './url-normalize': loadTs('lib/url-normalize.ts'), './db': { requireSql: () => async (parts,...values) => {
        const sql=parts.reduce((out,part,i)=>out+(i?'$'+i:'')+part,''); return (await pool.query(sql,values)).rows;
      } } }).upsertSource;
      const original='Publisher evidence remains intact. '.repeat(12);
      const input={projectId:project,title:'Article',url:'https://publisher.org/article',sourceType:'Article'};
      const saved=await upsert({...input,cleanedText:original,contentSnippet:'Evidence snippet'});
      await upsert({...input,title:'Rediscovered',contentSnippet:'Search snippet'});
      const row=(await pool.query('SELECT * FROM sources WHERE id=$1',[saved.id])).rows[0];
      assert.equal(row.cleaned_text,original); assert.equal(row.content_snippet,'Evidence snippet');
      assert.equal(Number((await pool.query('SELECT count(*) FROM source_analysis_versions WHERE source_id=$1',[saved.id])).rows[0].count),1);
    });

    await t.test('snapshot capture time follows successful scrape independently of FIFO age', async () => {
      const text='Recently captured legacy evidence. '.repeat(12);
      // Simulate a pre-migration legacy row, without invoking the queue trigger.
      await pool.query('ALTER TABLE sources DISABLE TRIGGER issuefy_queue_source_version');
      const legacy=(await pool.query("INSERT INTO sources(project_id,title,url,cleaned_text,content_hash,created_at,scraped_at) VALUES($1,'Legacy','https://legacy.example.org',$2,$3,'2020-01-01T00:00:00Z','2026-09-16T10:00:00Z') RETURNING id",[project,text,hash(text)])).rows[0].id;
      await pool.query('ALTER TABLE sources ENABLE TRIGGER issuefy_queue_source_version');
      await pool.query(readFileSync(join(__dirname,'../../migrations/0022_source_analysis_versions.sql'),'utf8'));
      let row=(await pool.query('SELECT created_at,captured_at FROM source_analysis_versions WHERE source_id=$1',[legacy])).rows[0];
      assert.equal(row.created_at.toISOString(),'2020-01-01T00:00:00.000Z');
      assert.equal(row.captured_at.toISOString(),'2026-09-16T10:00:00.000Z');
      const next='Newly changed evidence. '.repeat(12);
      await pool.query("UPDATE sources SET cleaned_text=$2,content_hash=$3,scraped_at='2026-09-16T11:00:00Z' WHERE id=$1",[legacy,next,hash(next)]);
      row=(await pool.query('SELECT captured_at FROM source_analysis_versions WHERE source_id=$1 ORDER BY content_revision DESC LIMIT 1',[legacy])).rows[0];
      assert.equal(row.captured_at.toISOString(),'2026-09-16T11:00:00.000Z');
      await pool.query("UPDATE sources SET scraped_at='2026-09-16T12:00:00Z' WHERE id=$1",[legacy]);
      row=(await pool.query('SELECT captured_at FROM source_analysis_versions WHERE source_id=$1 ORDER BY content_revision DESC LIMIT 1',[legacy])).rows[0];
      assert.equal(row.captured_at.toISOString(),'2026-09-16T11:00:00.000Z');
    });

  } finally {
    if(pool) await pool.end();
    try { execFileSync('pg_ctl',['-D',data,'-m','immediate','-w','stop'],{stdio:'ignore'}); } catch {}
    rmSync(root,{recursive:true,force:true});
  }
});
