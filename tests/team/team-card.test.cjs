const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('../helpers/load-ts.cjs');
function harness() {
  const state = [{members:[{id:'member',email:'member@example.test',role:'editor'}], invitations:[{id:'invite',email:'invite@example.test',role:'viewer',expires_at:'2099-01-01'}]}, false, null, 'new@example.test', 'editor', false, 2];
  let index=0, refreshes=0;
  const Component = loadTs('components/settings/TeamCard.tsx', {
    react:{useEffect(){},useState(initial){const n=index++; if(n>=state.length)state[n]=initial; return [state[n],v=>{state[n]=typeof v==='function'?v(state[n]):v;}];}},
    'react/jsx-runtime':require('react/jsx-runtime'), 'next/navigation':{useRouter:()=>({refresh(){refreshes++;}})}, '@/components/icons/Icon':{Icon:()=>null},
  }).default;
  const tree=Component({projectId:'project',currentUserId:'owner',seatsUsedInitial:2,seatsLimit:3});
  const nodes=[]; function visit(n){if(!n||typeof n!=='object')return;nodes.push(n);for(const c of [n.props?.children].flat(Infinity))visit(c);}visit(tree);
  return {state,nodes,get refreshes(){return refreshes;},async act(action,response){const old=global.fetch, confirm=global.confirm;global.confirm=()=>true;let calls=0;global.fetch=async()=>{calls++;if(response instanceof Error)throw response;return response;};try{await action();return calls;}finally{global.fetch=old;global.confirm=confirm;}}};
}
for(const action of ['onCancel','onRemove','onChangeRole'])for(const failure of [new Response('{}',{status:503}),new Error('offline')])test(`${action} preserves seats and reports ${failure instanceof Error?'network':'HTTP'} failure`,async()=>{
  const h=harness(), node=h.nodes.find(n=>n.props?.[action]);
  assert.equal(await h.act(()=>node.props[action]('viewer'),failure),1);
  assert.equal(h.state[6],2);assert.match(h.state[2],/couldn't/i);assert.equal(h.refreshes,0);
});
test('invite handles network rejection and releases pending state',async()=>{const h=harness();await h.act(h.nodes.find(n=>n.type==='button'&&n.props.children==='Send invitation').props.onClick,new Error('offline'));assert.equal(h.state[5],false);assert.equal(h.state[6],2);assert.match(h.state[2],/couldn't/i);});
for (const action of ['onCancel','onRemove','onChangeRole']) test(`${action} refreshes only after successful mutation`,async()=>{
 const h=harness(),node=h.nodes.find(n=>n.props?.[action]);
 assert.equal(await h.act(()=>node.props[action]('viewer'),new Response(JSON.stringify({members:[],invitations:[]}))),2);
 assert.equal(h.state[6],action==='onChangeRole'?2:1);assert.equal(h.state[2],null);assert.equal(h.refreshes,action==='onRemove'?1:0);
});
