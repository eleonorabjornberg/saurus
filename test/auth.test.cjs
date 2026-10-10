const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient } = require('../backend/node_modules/@supabase/supabase-js');
const { createAuthService, storageAdapter, SESSION_KEY } = require('../auth-service');

function harness(t, initial = {}) {
  const values = { ...initial }, calls = [];
  let offline = false, confirm = false;
  const storage = {
    async get(key) { return { [key]: values[key] }; },
    async set(items) { Object.assign(values, items); },
    async remove(key) { delete values[key]; },
  };
  const makeSession = (id='account-a') => ({
    access_token: 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url') + '.signature',
    refresh_token: 'private-refresh-' + id, token_type:'bearer', expires_in:3600,
    user:{id,email:id+'@example.com',aud:'authenticated',role:'authenticated',identities:[{}]},
  });
  const fetch = async (url, options={}) => {
    calls.push({url:String(url),options});
    const body=options.body ? JSON.parse(options.body) : {};
    let data={};let status=200;
    if(String(url).includes('/token')) data=makeSession(body.email?.startsWith('b@')?'account-b':'account-a');
    else if(String(url).includes('/signup')) data=confirm?{user:makeSession().user}:makeSession();
    else if(String(url).includes('/logout')) data={};
    else if(String(url).includes('/rpc/')) {
      if(offline){status=503;data={message:'offline'};}
      else if(['profile','onboard','preferences'].includes(body.p_op)) data={language:'es',onboarded:true};
      else data={level:3,struggles:[{word:'casa',misses:2}],next:{type:'recall',word:'casa'}};
    }
    return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
  };
  function worker(){
    const service=createAuthService({createClient:(url,key,options)=>createClient(url,key,{...options,global:{fetch}}),config:{url:'https://example.supabase.co',anonKey:'public-test-key'},storage});
    t.after(()=>service.dispose());return service;
  }
  return {values,calls,storage,worker,makeSession,setOffline(v){offline=v;},setConfirmation(v){confirm=v;}};
}
test('Chrome storage adapter survives new instances',async()=>{
  const data={};const storage={async get(k){return {[k]:data[k]};},async set(v){Object.assign(data,v);},async remove(k){delete data[k];}};
  await storageAdapter(storage).setItem('session','saved');
  assert.equal(await storageAdapter(storage).getItem('session'),'saved');
});
test('real Supabase SDK persists sign-in and restores after worker recreation without exposing tokens',async t=>{
  const h=harness(t);const a=h.worker();
  const signed=await a.handle('signin',{email:'a@example.com',password:'password123'});
  assert.equal(signed.user.id,'account-a');assert.doesNotMatch(JSON.stringify(signed),/refresh_token|access_token|private-refresh/);
  assert.match(h.values[SESSION_KEY],/private-refresh/);
  await a.dispose();const b=h.worker();
  assert.equal((await b.handle('status')).user.id,'account-a');
  assert.equal(h.calls.filter(c=>c.url.includes('/token')).length,1);
});
test('expired token is refreshed by SDK after a new worker starts and rotation is persisted',async t=>{
  const h=harness(t);const expired={...h.makeSession(),expires_at:Math.floor(Date.now()/1000)-60};
  h.values[SESSION_KEY]=JSON.stringify(expired);
  const service=h.worker();assert.equal((await service.handle('status')).user.id,'account-a');
  const refresh=h.calls.find(c=>c.url.includes('grant_type=refresh_token'));
  assert.ok(refresh);assert.ok(JSON.parse(h.values[SESSION_KEY]).expires_at>Date.now()/1000);
});
test('temporary memory outage preserves session and uses only the same account cache',async t=>{
  const h=harness(t);const a=h.worker();await a.handle('signin',{email:'a@example.com',password:'password123'});
  await a.handle('memory',{op:'memory',args:{language:'es'},expectedUserId:'account-a'});
  h.setOffline(true);
  assert.equal((await a.handle('status')).offline,true);
  assert.equal((await a.handle('memory',{op:'memory',args:{language:'es'},expectedUserId:'account-a'})).level,3);
  assert.ok(h.values[SESSION_KEY]);
});
test('account changes reject stale tab writes and sign-out clears persistent auth',async t=>{
  const h=harness(t),a=h.worker();await a.handle('signin',{email:'a@example.com',password:'password123'});
  await a.handle('signout');assert.equal(h.values[SESSION_KEY],undefined);
  assert.equal((await a.handle('status')).user,null);
  await a.handle('signin',{email:'b@example.com',password:'password123'});
  await assert.rejects(a.handle('memory',{op:'answer',expectedUserId:'account-a',args:{language:'es',word:'casa',correct:true}}),/account changed/);
  assert.equal(h.calls.filter(c=>c.options.body?.includes('"p_op":"answer"')).length,0);
});
test('signup with email verification reports pending verification without inventing a session',async t=>{
  const h=harness(t);h.setConfirmation(true);const a=h.worker();
  assert.deepEqual(await a.handle('signup',{email:'a@example.com',password:'password123'}),{verification:true});
  assert.equal((await a.handle('status')).user,null);
});
test('signup with confirmation disabled returns an authenticated account',async t=>{
  const h=harness(t),a=h.worker();assert.equal((await a.handle('signup',{email:'a@example.com',password:'password123'})).user.id,'account-a');
});
