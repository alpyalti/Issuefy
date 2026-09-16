const {test}=require('node:test'),assert=require('node:assert/strict');const {loadTs}=require('../helpers/load-ts.cjs');
const targets=loadTs('lib/scrape-targets.ts',{'./url-normalize':loadTs('lib/url-normalize.ts')});
function fixture({cap=2,stored=0,urls=['https://example.com/a'],discovered=[],rejectFirst=false,reservationResults=null}={}){
 let calls=0,reservations=0,stores=0;
 const sql=async(strings,...values)=>{const q=strings.join('?');
 if(q.includes('FROM projects WHERE'))return[{id:'project',user_id:'owner',name:'QA',target_market:'GLOBAL',is_active:true}];
 if(q.includes('FROM users WHERE'))return[{id:'owner',email:'qa@example.invalid',plan:'starter',email_brief_enabled:false}];
 if(q.includes('INSERT INTO scrape_jobs'))return[{id:'job'}];
 if(q.includes('FROM keywords'))return[];
 if(q.includes('FROM competitors'))return urls.map((website_url,i)=>({id:'c'+i,website_url,is_active:true,socials:{}}));
 if(q.includes('COUNT(*)'))return[{n:stored}];
 if(q.includes('FROM sources'))return discovered;
 return[];};
 const mocks={
 './scrape-jobs':{withScrapeLease:async (_project,run)=>run(async()=>{}),JobEntryError:class extends Error {}},
 '@/lib/billing-gate':{ensureProjectWorkerSubscription:async()=>{}},'./db':{requireSql:()=>sql,withTx:async fn=>fn({query:async()=>({rows:[]})})},
 './scraperapi':{standardScrape:async()=>{calls++;return{html:'html'}},serpDiscover:async()=>[]},
 './cleaner':{cleanForStorage:()=>({ok:!(rejectFirst&&calls===1),title:'QA',snippet:'content'})},
 './sources':{upsertSource:async()=>{stores++;return{inserted:false}}},'./storage':{archiveRawHtml:async()=>null,sourceArchiveKey:()=> 'raw/synthetic-fixture.html'},
 './usage-counters':{reserveCalls:async(_u,key)=>{if(key==='scrape_calls'){reservations++;return reservationResults?.[reservations-1] ?? 1;}return 1},claimCapNotice:async()=>false},
 './usage':{getLimits:()=>({maxSourcesPerProjectPerDay:cap,scrapeCallsPerCycle:reservationResults ? 1 : 100,sourcesPerMonth:100})},
 './mailer':{sendUsageNoticeEmail:async()=>{},sendDailyBriefEmail:async()=>{}},'./sentry':{captureBreadcrumb:()=>{},captureError:()=>{}},
 './signals':{generateSignalsForProject:async()=>({inserted:0,rejected:0,modelUsed:null,errors:[]})},
 './daily-summary':{generateDailySummaryForProject:async()=>({status:'skipped',summaryDate:null,errors:[]})},
 './social-monitor':{pickSocialScrapeTargets:async()=>[],ingestRedditActivity:async()=>({inserted:0})},
 './markets':{resolveMarket:()=>({matched:true,langs:['en']})},'./translation':{translateKeyword:async()=>''},'./scrape-targets':targets};
 const worker=loadTs('lib/process-project.ts',mocks).processProject;
 return{run:()=>worker('project','daily'),counts:()=>({calls,reservations,stores})};
}
test('already exhausted daily source cap reserves no scrape quota and calls no provider',async()=>{const f=fixture({cap:1,stored:1});await f.run();assert.deepEqual(f.counts(),{calls:0,reservations:0,stores:0});});
test('competitor plus discovered duplicate has one actual fetch and reservation',async()=>{const f=fixture({discovered:[{url:'https://www.example.com/a?utm_source=x',competitor_id:null,keyword_id:'k'}]});await f.run();assert.deepEqual(f.counts(),{calls:1,reservations:1,stores:1});});
test('one remaining slot limits parallel calls and counts refreshed sources',async()=>{const f=fixture({cap:1,urls:['https://a.example','https://b.example','https://c.example']});await f.run();assert.deepEqual(f.counts(),{calls:1,reservations:1,stores:1});});
test('blocked first target does not skip later targets in a reduced batch',async()=>{const f=fixture({cap:1,rejectFirst:true,urls:['https://a.example','https://b.example','https://c.example']});await f.run();assert.deepEqual(f.counts(),{calls:2,reservations:2,stores:1});});

test('budget refusal retains later settled success and prevents another batch',async()=>{
 const f=fixture({cap:10,urls:['https://a.example','https://b.example','https://c.example','https://d.example','https://e.example'],reservationResults:[2,1,3,4]});
 const result=await f.run();
 assert.deepEqual(f.counts(),{calls:1,reservations:4,stores:1});
 assert.equal(result.sourcesRefreshed,1);assert.equal(result.scrapeCallsUsed,1);assert.equal(result.status,'partial');
 assert.equal(result.errors.filter(e=>e.includes('BUDGET_EXHAUSTED')).length,3);
});
