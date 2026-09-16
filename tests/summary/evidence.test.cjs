const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const project={id:'project',name:'Demo',industry:'Software',business_type:'SaaS',target_market:'GLOBAL'};
const paragraph=Array(90).fill('evidence').join(' ');
function fixture({signals=[{id:'signal-a',title:'Dated launch',category:'Competitor Move',importance:'Medium',description:'A supported launch',source_domain:'vendor.test',source_id:'source-a'}],sources=[{id:'source-a',title:'Announcement',url:'https://vendor.test/news',domain:'vendor.test',content_snippet:'Dated evidence'}],citations=['source-a']}={}) {
 const queries=[],writes=[],calls=[];
 const sql=async(strings,...values)=>{const query=strings.join('?');queries.push({query,values});
  if(query.includes('FROM projects'))return [project];
  if(query.includes('FROM signals s'))return signals;
  if(query.includes('FROM sources src'))return sources;
  throw Error('unexpected query');};
 const {generateDailySummaryForProject}=loadTs('lib/daily-summary.ts',{
  './db':{requireSql:()=>sql,withTx:async fn=>fn({query:async(q,v)=>{writes.push({q,v});return {rows:q.includes('RETURNING')?[{id:'brief',xmax:'0'}]:[]};}})},
  './openrouter':{chatJson:async opts=>{calls.push(opts);return {data:{summary_text:paragraph,source_ids:citations},modelUsed:'fixture'};}},
  './sentry':{captureError:()=>{}},'./markets':{resolveMarket:()=>({canonicalName:'Global'})},
  './company-block':{companyPromptBlock:()=>''},'./schemas/ai':{dailySummaryResponseSchema:{}},
 });
 return {run:()=>generateDailySummaryForProject('project'),queries,writes,calls};
}
test('no current accepted signals means no source fallback, model call or summary write',async()=>{
 const f=fixture({signals:[]});const r=await f.run();assert.equal(r.status,'skipped');assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);assert.equal(f.queries.length,2);
});
test('missing source evidence does not overwrite a previous brief',async()=>{
 const f=fixture({sources:[]});assert.equal((await f.run()).status,'skipped');assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
});
test('accepted signal query uses explicit current UTC day; source query binds only selected signal IDs',async()=>{
 const f=fixture();await f.run();const signal=f.queries[1];assert.match(signal.query,/AT TIME ZONE 'UTC'/);assert.match(signal.query,/s.created_at >=/);assert.match(signal.query,/s.created_at </);assert.match(signal.query,/src.project_id =/);
 assert.match(f.queries[2].query,/ss.signal_id = ANY/);assert.deepEqual(f.queries[2].values[1],['source-a']);assert.deepEqual(f.queries[2].values[2],['signal-a']);assert.match(f.calls[0].messages[1].content,/source_id: source-a/);
});
for(const citations of [[],['invented'],['source-a','invented']])test(`unsupported citations ${JSON.stringify(citations)} reject complete output before writes`,async()=>{
 const f=fixture({citations});const r=await f.run();assert.equal(r.status,'skipped');assert.equal(f.writes.length,0);assert.equal(r.summaryText,'');assert.match(r.errors.at(-1),/citations/);
});
test('one supporting source is sufficient and repeated IDs are stored once',async()=>{
 const f=fixture({citations:['source-a','source-a']});const r=await f.run();assert.equal(r.status,'created');assert.deepEqual(r.sourceIds,['source-a']);assert.equal(f.writes.filter(x=>x.q.includes('INSERT INTO daily_summary_sources')).length,1);assert.equal(f.calls.length,1);
});
