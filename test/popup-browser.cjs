/* Optional UI smoke test: SAURUS_PLAYWRIGHT=/path/to/playwright node test/popup-browser.cjs */
const { chromium } = require(process.env.SAURUS_PLAYWRIGHT || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
(async()=>{
  const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:390,height:720}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      window.chrome={runtime:{lastError:null,sendMessage(message,callback){
        let data={user:null,profile:null};
        if(message.type==='signup') data={user:{id:'test'},profile:{onboarded:false}};
        if(message.type==='memory') data={onboarded:true,language:'sv'};
        callback({ok:true,data});
      }},tabs:{async query(){return [{id:1}];},async sendMessage(){}}};
    });
    await page.goto('file://'+path.resolve('popup.html'));
    await page.getByRole('heading',{name:'Meet your new learning companion.'}).waitFor();
    await page.screenshot({path:'/private/tmp/saurus-welcome.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Get Started'}).click();
    await page.getByRole('button',{name:'Create Account'}).click();
    assert.equal(await page.locator('#email').getAttribute('aria-invalid'),'true');
    await page.getByLabel('Email address').fill('new@example.com');
    await page.getByLabel('Password',{exact:true}).fill('Password123');
    await page.getByLabel('Confirm password',{exact:true}).fill('different');
    await page.getByRole('button',{name:'Show password',exact:true}).click();
    assert.equal(await page.locator('#password').getAttribute('type'),'text');
    await page.getByRole('button',{name:'Create Account'}).click();
    assert.equal(await page.locator('#confirm').getAttribute('aria-invalid'),'true');
    await page.getByLabel('Confirm password',{exact:true}).fill('Password123');
    await page.screenshot({path:'/private/tmp/saurus-signup.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Create Account'}).click();
    await page.getByRole('heading',{name:'Where shall we go?'}).waitFor();
    await page.getByRole('button',{name:'Swedish'}).click();
    assert.equal(await page.getByRole('button',{name:'Swedish'}).getAttribute('aria-pressed'),'true');
    await page.screenshot({path:'/private/tmp/saurus-onboarding.png',fullPage:true,animations:'disabled'});
    await page.getByRole('button',{name:'Let’s begin'}).click();
    await page.getByRole('heading',{name:'Your learning adventure starts now!'}).waitFor();
    assert.deepEqual(errors,[]);
    console.log('Popup welcome, validation, visibility toggle, signup, language selection and success flow passed (mock auth).');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
