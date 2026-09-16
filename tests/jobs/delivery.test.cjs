const test = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const json = (body, init) => new Response(JSON.stringify(body), init);

test('seven slow jobs are all persisted before response; acknowledgements release fan-out slots', async () => {
  let persisted = false;
  const after = [], delivered = [];
  const jobs = Array.from({length: 7}, (_,i) => ({ id: `job-${i}`, project_id: `project-${i}`, job_type: 'daily' }));
  const route = loadTs('app/api/cron/daily-scrape/route.ts', {
    'next/server': { after: fn => after.push(fn) }, '@/lib/env': { configuredEnv: () => 'test-secret' },
    '@/lib/cron-auth': { checkCronSecret: () => null }, '@/lib/api': { json },
    '@/lib/scrape-jobs': { enqueueDailyJobs: async () => { persisted=true; return jobs; }, recordDispatchFailure: async () => assert.fail('delivery should succeed') },
    '@/lib/fetch': { fetchWithTimeout: async (_url, init) => { assert.ok(persisted); delivered.push(JSON.parse(init.body)); return json({ status: 'pending' }, { status: 202 }); } },
    '@/lib/sentry': { captureError() {} },
  });
  const res = await route.GET(new Request('https://test.invalid'));
  assert.equal(res.status, 202); assert.equal((await res.json()).queued, 7);
  assert.ok(persisted); assert.equal(delivered.length, 0);
  await after[0](); assert.equal(delivered.length, 7);
  assert.deepEqual(delivered.map(x=>x.jobId), jobs.map(x=>x.id));
});

test('delivery failure retains the same durable ID for retry', async () => {
  const callbacks = [], errors = [];
  const route = loadTs('app/api/cron/daily-scrape/route.ts', {
    'next/server': { after: fn => callbacks.push(fn) }, '@/lib/env': { configuredEnv: () => 'test-secret' },
    '@/lib/cron-auth': { checkCronSecret: () => null }, '@/lib/api': { json },
    '@/lib/scrape-jobs': { enqueueDailyJobs: async () => [{ id: 'persisted', project_id: 'p' }], recordDispatchFailure: async id => errors.push(id) },
    '@/lib/fetch': { fetchWithTimeout: async () => json({}, { status: 503 }) }, '@/lib/sentry': { captureError() {} },
  });
  await route.POST(new Request('https://test.invalid')); await callbacks[0]();
  assert.deepEqual(errors, ['persisted']);
});

test('worker acknowledges pending ID without awaiting slow processing; rejects ad-hoc jobs', async () => {
  const after = []; let calls = 0;
  const id='00000000-0000-4000-8000-000000000001', projectId='00000000-0000-4000-8000-000000000002';
  let status = 'pending';
  const route = loadTs('app/api/internal/process-project/route.ts', {
    'next/server': { after: fn => after.push(fn) }, zod: require('zod'), '@/lib/cron-auth': { checkInternalSecret: () => null },
    '@/lib/process-project': { processProject() {} }, '@/lib/api': { json },
    '@/lib/db': { requireSql: () => async () => [{ id, status, job_type: 'daily' }] },
    '@/lib/scrape-jobs': { runQueuedJob: async () => { calls++; } },
  });
  const request = body => new Request('https://test.invalid', {method:'POST',body:JSON.stringify(body)});
  assert.equal((await route.POST(request({projectId,jobId:id}))).status,202); assert.equal(calls,0);
  await after[0](); assert.equal(calls,1);
  status='partial'; assert.equal((await route.POST(request({projectId,jobId:id}))).status,200); assert.equal(after.length,1);
  assert.equal((await route.POST(request({projectId,jobType:'daily'}))).status,400);
});

function manualRoute({ access=true, status='pending' }={}) {
  const after=[], reads=[];let claims=0;
  const id='00000000-0000-4000-8000-000000000001';
  const route=loadTs('app/api/projects/[id]/refresh/route.ts',{
    'next/server':{after:fn=>after.push(fn)},'@/lib/clerk-user':{requireUser:async()=>({id:'member'})},
    '@/lib/billing-gate':{ensureProjectSubscriptionApi:async()=>({})},'@/lib/admin':{isAdmin:async()=>false},
    '@/lib/db':{requireSql:()=>async(strings,...values)=>{reads.push({query:strings.join('?'),values});return [{id,status,job_type:'manual'}];}},
    '@/lib/api':{json,manageableProject:async()=>access?{id:'project'}:null,ownedProject:async()=>access?{id:'project'}:null,notFound:()=>json({}, {status:404})},
    '@/lib/entitlement-claims':{claimManualRefresh:async()=>{claims++;return {jobId:id};}},
    '@/lib/process-project':{processProject(){}},'@/lib/scrape-jobs':{runQueuedJob:async()=>{}},
  });
  return {route,id,after,reads,claims:()=>claims,ctx:{params:Promise.resolve({id:'project'})}};
}
test('explicit pending delivery retry is scoped to project and does not reserve quota again',async()=>{
  const h=manualRoute();
  const r=await h.route.POST(new Request(`https://test.invalid?jobId=${h.id}`,{method:'POST'}),h.ctx);
  assert.equal(r.status,202);assert.equal(h.claims(),0);assert.equal(h.after.length,1);
  assert.deepEqual(h.reads[0].values,[h.id,'project']);
  for(const status of ['running','completed','partial','failed']){
    const blocked=manualRoute({status});
    assert.equal((await blocked.route.POST(new Request(`https://test.invalid?jobId=${blocked.id}`,{method:'POST'}),blocked.ctx)).status,409);
    assert.equal(blocked.after.length,0);assert.equal(blocked.claims(),0);
  }
});
test('nonmembers/viewers cannot retry and nonmembers cannot read job status',async()=>{
  const h=manualRoute({access:false});
  assert.equal((await h.route.POST(new Request(`https://test.invalid?jobId=${h.id}`,{method:'POST'}),h.ctx)).status,404);
  assert.equal((await h.route.GET(new Request('https://test.invalid'),h.ctx)).status,404);
  assert.equal(h.reads.length,0);assert.equal(h.after.length,0);
});
test('job status query is membership-scoped, uncached and excludes raw provider errors',async()=>{
  const h=manualRoute();const r=await h.route.GET(new Request('https://test.invalid'),h.ctx);
  assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(h.reads[0].values,['project']);
  assert.match(h.reads[0].query,/status='running'.*started_at/s);
  assert.doesNotMatch(h.reads[0].query,/SELECT[^]*result\s*[, ]/);
});

test('transient failure before starting retains pending delivery; explicit eligibility rejection is terminal',async()=>{
  const statements=[];
  const jobs=loadTs('lib/scrape-jobs.ts',{
    './db':{requireSql:()=>async(strings,...values)=>{statements.push(strings.join('?'));return [];},withSession(){}},
    './sentry':{captureError(){}},
  });
  await jobs.runQueuedJob('p','manual','j',async()=>{throw new Error('connection unavailable');});
  assert.match(statements.pop(),/dispatch_error/);
  await jobs.runQueuedJob('p','manual','j',async()=>{throw new jobs.JobEntryError('paused');});
  assert.match(statements.pop(),/status='failed'/);
});
