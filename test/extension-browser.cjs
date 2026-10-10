/* Real MV3 extension/browser restart test against a local mock Supabase server.
 * Never copies .env or contacts the production project. Requires Playwright Chromium.
 */
const {chromium}=require(process.env.SAURUS_PLAYWRIGHT || 'playwright');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
(async()=>{
  let refreshes=0;
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=raw?JSON.parse(raw):{};
    res.setHeader('Content-Type','application/json');
    if(req.url.startsWith('/auth/v1/token')) {
      if(req.url.includes('refresh_token'))refreshes++;
      const id='11111111-1111-4111-8111-111111111111';
      const jwt='eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.signature';
      res.end(JSON.stringify({access_token:jwt,refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user:{id,email:'test@example.com',aud:'authenticated',role:'authenticated'}}));
    }else if(req.url.startsWith('/rest/v1/rpc/'))res.end(JSON.stringify(body.p_op==='profile'?{onboarded:true,language:'sv'}:{level:3,struggles:[],next:{type:'reading'}}));
    else res.end('{}');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'saurus-extension-test-'));
  const ext=path.join(temp,'extension');await fs.mkdir(ext);
  for(const file of ['manifest.json','background.js','auth-service.js','popup.html','popup.css','popup.js','vendor','assets','config.js','auth-bridge.js','backend-gemini.js','backend-mock.js','backend.js','saurus.js'])await fs.cp(path.resolve(file),path.join(ext,file),{recursive:true});
  await fs.writeFile(path.join(ext,'supabase-config.js'),`globalThis.SAURUS_SUPABASE = ${JSON.stringify({url:base,anonKey:'public-fixture-key',gemini:false})};`);
  const manifest=JSON.parse(await fs.readFile(path.join(ext,'manifest.json'),'utf8'));
  manifest.host_permissions=['http://127.0.0.1/*'];
  await fs.writeFile(path.join(ext,'manifest.json'),JSON.stringify(manifest));
  const launch=()=>chromium.launchPersistentContext(path.join(temp,'profile'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
  let context;
  try{
    context=await launch();
    let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    let page=await context.newPage();await page.goto(`chrome-extension://${id}/popup.html#account`);
    const send=(p,type,payload)=>p.evaluate(({type,payload})=>chrome.runtime.sendMessage({channel:'saurus-account',type,payload}),{type,payload});
    const signed=await send(page,'signin',{email:'test@example.com',password:'Password123'});
    assert.equal(signed.ok,true,JSON.stringify(signed));
    assert.equal(signed.data.profile.language,'sv');
    assert.doesNotMatch(JSON.stringify(signed),/access_token|refresh_token/);
    // Persist an expired token before closing. New worker must refresh it.
    await page.evaluate(async()=>{const key='saurus.auth.v1';const data=await chrome.storage.local.get(key);const session=JSON.parse(data[key]);session.expires_at=Math.floor(Date.now()/1000)-120;await chrome.storage.local.set({[key]:JSON.stringify(session)});});
    await context.close();context=await launch();
    worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    page=await context.newPage();await page.goto(`chrome-extension://${id}/popup.html#account`);
    const restored=await send(page,'status');assert.equal(restored.ok,true,JSON.stringify(restored));
    assert.equal(restored.data.user.email,'test@example.com');assert.equal(restored.data.profile.language,'sv');assert.ok(refreshes>=1);
    const devtools=await context.newCDPSession(page);
    await devtools.send('ServiceWorker.enable');
    await devtools.send('ServiceWorker.stopAllWorkers');
    const awakened=await send(page,'status');
    assert.equal(awakened.data.user.email,'test@example.com');
    const signedOut=await send(page,'signout');assert.equal(signedOut.ok,true);
    assert.equal((await send(page,'status')).data.user,null);
    console.log('MV3 worker startup/suspension, real Chrome storage, browser close/relaunch, expired-token refresh, and explicit logout passed against local mock Auth.');
    console.log('Isolated test profile retained at '+temp);
  }finally{if(context)await context.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
