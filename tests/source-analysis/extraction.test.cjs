const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
const versions = () => [{ id:'version1',source_id:'source1',title:'Article',url:'https://example.org',cleaned_text:'Current content. '.repeat(20),prior_cleaned_text:'Previous content.',last_changed_at:'2025-01-01',result_signals:null,result_index:0 }];
async function run({ cached=false, fail=false, empty=false, invalid=false }={}) {
  let calls=0,released=0,prompt,results;
  const rows=empty?[]:versions(); if(cached) rows[0].result_signals=[];
  const module=loadTs('lib/signals.ts',{
    './source-analysis':{claimAnalysis:async()=>({token:'token',versions:rows}),releaseAnalysis:async()=>{released++;},finishAnalysis:async(_p,_t,r)=>{results=r;return {inserted:0,duplicates:0,finalized:rows.length};}},
    './db':{requireSql:()=>async(parts)=>{const q=parts.join('');if(q.includes('FROM projects'))return[{id:'p',user_id:'u',target_market:'GLOBAL'}];if(q.includes('FROM users'))return[{plan:'starter'}];if(q.includes('COUNT(*)'))return[{n:0}];return[];}},
    './openrouter':{chatJson:async(opts)=>{calls++;prompt=opts;if(fail)throw Error('provider unavailable');return {data:{signals:invalid?[{source_id:'unknown'},...(invalid==='mixed'?[{source_id:'version1'}]:[])]:[]},modelUsed:'mock'};}},
    './usage-counters':{reserveCalls:async()=>{}},'./usage':{getLimits:()=>({maxSignalsPerProjectPerDay:20})},'./sentry':{captureError:()=>{}},'./markets':{resolveMarket:()=>({canonicalName:'Global'})},'./company-block':{companyPromptBlock:()=>''},'./schemas/ai':{SIGNAL_CATEGORIES:[],IMPORTANCE:[],signalExtractionResponseSchema:{}},
  });
  return{result:await module.generateSignalsForProject('p'),calls,released,prompt,results};
}
test('successful empty model result completes immutable version with before evidence retained beyond one hour',async()=>{
  const r=await run();assert.equal(r.calls,1);assert.deepEqual(r.results.get('version1'),[]);assert.match(r.prompt.messages[1].content,/Previous content/);assert.match(r.prompt.messages[1].content,/version1/);
});
test('cached proposals and drained backlog never call the provider',async()=>{
  for(const options of [{cached:true},{empty:true}]){const r=await run(options);assert.equal(r.calls,0);assert.deepEqual(r.result.errors,[]);}
});
test('provider failure releases claim for retry without recording completion',async()=>{
  const r=await run({fail:true});assert.equal(r.released,1);assert.equal(r.results,undefined);assert.match(r.result.errors[0],/provider unavailable/);
});
test('fingerprints normalize formatting only, preserve distinct substantive claims',()=>{
  const {signalFingerprint}=loadTs('lib/source-analysis.ts',{'./db':{},'./usage':loadTs('lib/usage.ts')});
  const s={title:'Acme pricing',description:'Price is $29.',category:'Competitor Move'};
  assert.equal(signalFingerprint(s),signalFingerprint({...s,title:' ACME  pricing '}));
  assert.notEqual(signalFingerprint(s),signalFingerprint({...s,description:'Price is $39.'}));
});

test('unknown source attribution releases the whole batch without empty completion',async()=>{
  for(const invalid of [true,'mixed']){const r=await run({invalid});assert.equal(r.released,1);assert.equal(r.results,undefined);assert.equal(r.result.rejected,1);assert.match(r.result.errors[0],/Invalid source attribution/);}
});
