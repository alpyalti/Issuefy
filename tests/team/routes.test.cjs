const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('../helpers/load-ts.cjs');
const zod=require('zod');
const base=loadTs('lib/api.ts',{zod,'./db':{}});
function setup(role='owner',targetRole='editor',mailFails=false){
 const calls={writes:0,mail:0,reserve:0};
 const project={id:'project',name:'Disposable',user_id:'owner'};
 const api={...base,adminProject:async()=>role==='owner'?project:null,ownedProject:async()=>role==='outsider'?null:project};
 const sql=async(strings)=>{const q=strings.join('?');if(q.includes('SELECT role'))return [{role:targetRole}];if(q.includes('UPDATE')||q.includes('DELETE'))calls.writes++;return [];};
 const mocks={zod,'@/lib/api':api,'@/lib/clerk-user':{requireUser:async()=>({id:role,email:`${role}@example.test`})},'@/lib/db':{requireSql:()=>sql},'@/lib/billing-gate':{ensureProjectSubscriptionApi:async()=>({ownerId:'owner'})},'@/lib/entitlement-claims':{reserveInvitation:async(owner,id,email,inviteRole)=>{calls.reserve++;return {invite:{id:'invite',email,role:inviteRole,token:'private-token'}};}},'@/lib/mailer':{sendInvitationEmail:async()=>{calls.mail++;if(mailFails)throw Error('provider down');}},'@/lib/sentry':{captureError(){},captureBreadcrumb(){}}};
 return {calls,load:file=>loadTs(file,mocks)};
}
const ctx=(extra={})=>({params:Promise.resolve({id:'project',...extra})});
const request=(body)=>new Request('http://localhost/disposable',{method:'POST',body:JSON.stringify(body)});
for(const role of ['owner','editor','viewer','outsider'])test(`${role}: invite and member mutation route boundaries`,async()=>{
 const h=setup(role);
 const invite=await h.load('app/api/projects/[id]/invitations/route.ts').POST(request({email:'invitee@example.test',role:'viewer'}),ctx());
 assert.equal(invite.status,role==='owner'?201:404);assert.equal(h.calls.mail,role==='owner'?1:0);
 assert.equal((await h.load('app/api/projects/[id]/invitations/[inviteId]/route.ts').DELETE(request({}),ctx({inviteId:'invite'}))).status,role==='owner'?204:404);
 const members=h.load('app/api/projects/[id]/members/[userId]/route.ts');
 assert.equal((await members.PATCH(request({role:'viewer'}),ctx({userId:'other'}))).status,role==='owner'?200:404);
 assert.equal((await members.DELETE(request({}),ctx({userId:'other'}))).status,role==='owner'?204:404);
 assert.equal((await h.load('app/api/projects/[id]/members/route.ts').GET(request({}),ctx())).status,role==='outsider'?404:200);
});
for(const role of ['editor','viewer'])test(`${role} can leave own membership`,async()=>{const h=setup(role);assert.equal((await h.load('app/api/projects/[id]/members/[userId]/route.ts').DELETE(request({}),ctx({userId:role}))).status,204);});
test('owner row cannot be demoted or removed',async()=>{const h=setup('owner','owner'),route=h.load('app/api/projects/[id]/members/[userId]/route.ts');assert.equal((await route.PATCH(request({role:'viewer'}),ctx({userId:'owner'}))).status,409);assert.equal((await route.DELETE(request({}),ctx({userId:'owner'}))).status,409);assert.equal(h.calls.writes,0);});
test('email-provider failure retains reservation and hides token',async()=>{const h=setup('owner','editor',true);const response=await h.load('app/api/projects/[id]/invitations/route.ts').POST(request({email:' INVITEE@example.test ',role:'viewer'}),ctx());assert.equal(response.status,201);const body=await response.json();assert.equal(body.invitation.email,'invitee@example.test');assert.equal(body.invitation.token,undefined);assert.equal(h.calls.reserve,1);assert.equal(h.calls.mail,1);});
test('self-invite and owner-role injection stop before reservation/email',async()=>{const h=setup(),route=h.load('app/api/projects/[id]/invitations/route.ts');assert.equal((await route.POST(request({email:'owner@example.test',role:'viewer'}),ctx())).status,409);assert.equal((await route.POST(request({email:'other@example.test',role:'owner'}),ctx())).status,400);assert.equal(h.calls.reserve,0);assert.equal(h.calls.mail,0);});
