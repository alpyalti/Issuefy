const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
function fixture({enabled=true, fail=false, jobs=[]}={}) {
 Object.assign(process.env,{R2_ENABLED:String(enabled),R2_ACCOUNT_ID:'test',R2_ACCESS_KEY_ID:'test',R2_SECRET_ACCESS_KEY:'test',R2_BUCKET:'test'});
 const queries=[],requests=[];
 const sql=async(strings,...values)=>{const query=strings.join('?');queries.push({query,values});return query.includes('WITH due')?jobs:[];};
 class Client {async send(cmd){requests.push(cmd.input);if(fail)throw Error('provider unavailable');}destroy(){}}
 class Command {constructor(input){this.input=input;}}
 const api=loadTs('lib/storage.ts',{'./env':{configuredEnv:v=>v},'./db':{requireSql:()=>sql},'@aws-sdk/client-s3':{S3Client:Client,PutObjectCommand:Command,DeleteObjectCommand:Command}});
 return {api,queries,requests};
}
const key='raw/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.html';
test('disabled storage neither claims cleanup nor makes provider calls',async()=>{
 const f=fixture({enabled:false,jobs:[{object_key:key}]});assert.equal((await f.api.drainStorageCleanup()).disabled,true);assert.equal(await f.api.archiveRawHtml(key,'html'),null);assert.equal(f.queries.length,0);assert.equal(f.requests.length,0);
});
test('failed object deletion retains job and schedules backoff rather than acknowledging',async()=>{
 const f=fixture({fail:true,jobs:[{object_key:key}]});assert.equal((await f.api.drainStorageCleanup()).failed,1);assert.equal(f.requests.length,1);assert.match(f.queries.at(-1).query,/available_at = now\(\) \+ interval '1 hour'/);assert.ok(!f.queries.some(q=>q.query.startsWith('DELETE')));
});
test('successful delete acknowledges only claimed token; currently referenced keys excluded',async()=>{
 const f=fixture({jobs:[{object_key:key}]});assert.equal((await f.api.drainStorageCleanup()).deleted,1);assert.match(f.queries[0].query,/NOT EXISTS.*SELECT 1 FROM sources/s);assert.match(f.queries[0].query,/SKIP LOCKED/);assert.match(f.queries.at(-1).query,/lease_token =/);
});
test('unexpected object prefixes never reach provider',async()=>{
 const f=fixture({jobs:[{object_key:'other-customer/important.pdf'}]});assert.equal((await f.api.drainStorageCleanup()).failed,1);assert.equal(f.requests.length,0);
});
test('upload reserves delayed orphan cleanup before sending; failed upload keeps record',async()=>{
 const f=fixture({fail:true});assert.equal(await f.api.archiveRawHtml(key,'html'),null);assert.match(f.queries[0].query,/INSERT INTO storage_cleanup_jobs/);assert.match(f.queries[0].query,/interval '1 day'/);assert.equal(f.requests.length,1);assert.equal(f.queries.length,1);
});
test('simultaneous archive attempts get different keys',()=>{
 const f=fixture();const keys=new Set(Array.from({length:100},()=>f.api.sourceArchiveKey('11111111-1111-4111-8111-111111111111')));assert.equal(keys.size,100);
});
