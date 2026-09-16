const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { loadTs } = require('../helpers/load-ts.cjs');
const pgBin = process.env.ISSUEFY_TEST_PG_BIN || '/opt/homebrew/opt/postgresql@17/bin';

test('durable jobs with disposable PostgreSQL (no external DB configuration)', {
  skip: !existsSync(join(pgBin,'postgres')) ? 'Set ISSUEFY_TEST_PG_BIN to PostgreSQL binaries' : false,
}, async t => {
  const dir = mkdtempSync(join(tmpdir(),'ify-jobs-'));
  const command = (name,args) => { const r=spawnSync(join(pgBin,name),args,{encoding:'utf8'}); assert.equal(r.status,0,r.stderr); };
  let pool, started=false;
  try {
    command('initdb',['-D',join(dir,'db'),'-A','trust','-U','postgres','--no-locale']);
    command('pg_ctl',['-D',join(dir,'db'),'-l',join(dir,'log'),'-o',`-k ${dir} -h '' -F`,'-w','start']); started=true;
    pool=new Pool({host:dir,user:'postgres',database:'postgres',max:12});
    const ddl=readFileSync(resolve(__dirname,'../../migrations/0001_init.sql'),'utf8');
    for(const table of ['users','projects','competitors','keywords','scrape_jobs','sources']) {
      await pool.query(ddl.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`))[0]);
    }
    await pool.query(`ALTER TABLE projects ADD COLUMN is_active boolean NOT NULL DEFAULT true;
      ALTER TABLE users ADD COLUMN email_brief_enabled boolean NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN email_brief_unsubscribe_token text`);
    const migration=readFileSync(resolve(__dirname,'../../migrations/0021_durable_jobs.sql'),'utf8');
    await pool.query(migration); await pool.query(migration);
    const sql=async(strings,...values)=>(await pool.query(strings.reduce((s,part,i)=>s+(i?'$'+i:'')+part,''),values)).rows;
    let lastLeaseClient;
    const withSession=async fn=>{const c=await pool.connect();lastLeaseClient=c;try{return await fn(c);}finally{c.release(true);}};
    const withTx=async fn=>{const c=await pool.connect();try{await c.query('BEGIN');const v=await fn(c);await c.query('COMMIT');return v;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}};
    const jobs=loadTs('lib/scrape-jobs.ts',{'./db':{requireSql:()=>sql,withSession},'./sentry':{captureError(){}}});
    async function project(active=true) {
      const owner=randomUUID(), id=randomUUID();
      await pool.query('INSERT INTO users(id,clerk_user_id,email) VALUES($1::uuid,$1::text,$2)',[owner,owner+'@test.invalid']);
      await pool.query("INSERT INTO projects(id,user_id,name,industry,business_type,target_market,is_active) VALUES($1,$2,'Test','Test','SaaS','GLOBAL',$3)",[id,owner,active]);
      return id;
    }
    await t.test('seven projects queue durably and simultaneous daily dispatches reuse IDs',async()=>{
      const ids=await Promise.all(Array.from({length:7},()=>project()));
      for(const id of ids) await pool.query("INSERT INTO competitors(project_id,name,website_url) VALUES($1,'Test','https://example.com')",[id]);
      const [a,b]=await Promise.all([jobs.enqueueDailyJobs(),jobs.enqueueDailyJobs()]);
      assert.equal(a.length,7);assert.equal(b.length,7);
      assert.deepEqual(new Set(a.map(j=>j.id)),new Set(b.map(j=>j.id)));
      const rows=await pool.query('SELECT count(*)::int n FROM scrape_jobs');assert.equal(rows.rows[0].n,7);
      // Delivery errors retain reservations, then another pass returns same IDs.
      await jobs.recordDispatchFailure(a[0].id,'unacknowledged');
      assert.ok((await jobs.enqueueDailyJobs()).some(j=>j.id===a[0].id));
      await pool.query("UPDATE scrape_jobs SET status='completed'");
    });
    await t.test('real session lease excludes same project; different project can proceed',async()=>{
      const id=await project();let release,ready;
      const entered=new Promise(r=>ready=r),gate=new Promise(r=>release=r);
      const first=jobs.withScrapeLease(id,async()=>{ready();await gate;});
      await entered;
      await assert.rejects(jobs.withScrapeLease(id,async()=>assert.fail('overlap')),jobs.ProjectBusyError);
      await jobs.withScrapeLease(await project(),async check=>check());
      release();await first;
      await jobs.withScrapeLease(id,async check=>check());
    });
    await t.test('live lease cannot be stolen even if job timestamp is stale',async()=>{
      const id=await project();let release,ready;
      const gate=new Promise(r=>release=r),entered=new Promise(r=>ready=r);
      const first=jobs.withScrapeLease(id,async()=>{
        await pool.query("INSERT INTO scrape_jobs(project_id,status,job_type,started_at) VALUES($1,'running','daily',now()-interval '1 hour')",[id]);ready();await gate;
      });await entered;
      await assert.rejects(jobs.withScrapeLease(id,async()=>{}),jobs.ProjectBusyError);
      assert.equal((await pool.query('SELECT status FROM scrape_jobs WHERE project_id=$1',[id])).rows[0].status,'running');
      release();await first;
      await jobs.withScrapeLease(id,async()=>{});
      const row=(await pool.query('SELECT status,error_message FROM scrape_jobs WHERE project_id=$1',[id])).rows[0];
      assert.equal(row.status,'failed');assert.match(row.error_message,/uncertain/);
    });
    await t.test('stale classification survives callback failure and lease rollback',async()=>{
      const id=await project();
      await pool.query("INSERT INTO scrape_jobs(project_id,status,job_type,started_at) VALUES($1,'running','daily',now()-interval '1 hour')",[id]);
      await assert.rejects(jobs.withScrapeLease(id,async()=>{throw new Error('synthetic entry failure');}),/synthetic entry failure/);
      assert.equal((await pool.query('SELECT status FROM scrape_jobs WHERE project_id=$1',[id])).rows[0].status,'failed');
    });
    await t.test('lost backend fails next checkpoint and fresh running journal blocks replacement',async()=>{
      const id=await project();let paidStages=0;
      await assert.rejects(jobs.withScrapeLease(id,async check=>{
        await check();
        await pool.query("INSERT INTO scrape_jobs(project_id,status,job_type,started_at) VALUES($1,'running','daily',now())",[id]);
        const pid=(await lastLeaseClient.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        await pool.query('SELECT pg_terminate_backend($1)',[pid]);
        await check();paidStages++;
      }));
      assert.equal(paidStages,0);
      await assert.rejects(jobs.withScrapeLease(id,async()=>{paidStages++;}),jobs.ProjectBusyError);
      assert.equal(paidStages,0);
      assert.equal((await pool.query('SELECT status FROM scrape_jobs WHERE project_id=$1',[id])).rows[0].status,'running');
    });
    const workerMocks={};
    for(const [,name] of readFileSync(resolve(__dirname,'../../lib/process-project.ts'),'utf8').matchAll(/from ["']([^"']+)["']/g)) {
      workerMocks[name]=new Proxy({}, {get:()=>()=>{throw new Error('Unexpected provider call');}});
    }
    Object.assign(workerMocks,{
      './db':{requireSql:()=>sql,withTx},'./scrape-jobs':jobs,'./usage':loadTs('lib/usage.ts'),
      './scrape-targets':loadTs('lib/scrape-targets.ts',{'./url-normalize':loadTs('lib/url-normalize.ts')}),
      '@/lib/billing-gate':{ensureProjectWorkerSubscription:async()=>{}},
      './markets':{resolveMarket:()=>({matched:true,langs:['en']})},
      './sentry':{captureError(){},captureBreadcrumb(){}},
      './social-monitor':{pickSocialScrapeTargets:()=>[],ingestRedditActivity:async()=>({inserted:0})},
      './daily-summary':{generateDailySummaryForProject:async()=>({status:'skipped',summaryDate:null,errors:[]})},
    });
    await t.test('partial stages persist truthful status and never advance success freshness',async()=>{
      const id=await project();
      const job=(await pool.query("INSERT INTO scrape_jobs(project_id,status,job_type) VALUES($1,'pending','manual') RETURNING id",[id])).rows[0].id;
      workerMocks['./signals']={generateSignalsForProject:async()=>({inserted:0,rejected:0,modelUsed:'mock',errors:['synthetic failure']})};
      const worker=loadTs('lib/process-project.ts',workerMocks);
      const result=await worker.processProject(id,'manual',job);assert.equal(result.status,'partial');
      const row=(await pool.query('SELECT status,result,error_message FROM scrape_jobs WHERE id=$1',[job])).rows[0];
      assert.equal(row.status,'partial');assert.match(row.error_message,/signals/);assert.equal(row.result.status,'partial');
      assert.equal((await pool.query('SELECT last_scraped_at FROM projects WHERE id=$1',[id])).rows[0].last_scraped_at,null);
      await assert.rejects(worker.processProject(id,'manual',job),/claim already consumed/);
    });
    await t.test('duplicate worker delivery makes one mocked provider stage call',async()=>{
      const id=await project();const job=(await pool.query("INSERT INTO scrape_jobs(project_id,status,job_type) VALUES($1,'pending','manual') RETURNING id",[id])).rows[0].id;
      let calls=0,release,ready;const gate=new Promise(r=>release=r),entered=new Promise(r=>ready=r);
      workerMocks['./signals']={generateSignalsForProject:async()=>{calls++;ready();await gate;return {inserted:0,rejected:0,modelUsed:'mock',errors:[]};}};
      const worker=loadTs('lib/process-project.ts',workerMocks);
      const first=worker.processProject(id,'manual',job);await entered;
      await jobs.runQueuedJob(id,'manual',job,worker.processProject);
      release();assert.equal((await first).status,'completed');
      await jobs.runQueuedJob(id,'manual',job,worker.processProject);
      assert.equal(calls,1);
      assert.equal((await pool.query('SELECT status FROM scrape_jobs WHERE id=$1',[job])).rows[0].status,'completed');
    });
    await t.test('expired never-started daily job is retained as failed, not replayed',async()=>{
      const id=await project();await pool.query("INSERT INTO competitors(project_id,name,website_url) VALUES($1,'Test','https://example.com')",[id]);
      const old=(await pool.query("INSERT INTO scrape_jobs(project_id,status,job_type,daily_key) VALUES($1,'pending','daily',(now() AT TIME ZONE 'UTC')::date-1) RETURNING id",[id])).rows[0].id;
      const pending=await jobs.enqueueDailyJobs();assert.ok(!pending.some(j=>j.id===old));assert.ok(pending.some(j=>j.project_id===id));
      assert.equal((await pool.query('SELECT status FROM scrape_jobs WHERE id=$1',[old])).rows[0].status,'failed');
    });
  } finally {
    if(pool)await pool.end();
    if(started)command('pg_ctl',['-D',join(dir,'db'),'-m','immediate','-w','stop']);
    rmSync(dir,{recursive:true,force:true});
  }
});
