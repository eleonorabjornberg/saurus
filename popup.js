"use strict";
const content = document.querySelector("#content");
const feedback = document.querySelector("#feedback");
let chosenLanguage = "de";
let account = null;
const languages = { fr: ["🇫🇷", "French"], de: ["🇩🇪", "German"], es: ["🇪🇸", "Spanish"], sv: ["🇸🇪", "Swedish"], hi: ["🇮🇳", "Hindi"] };
function request(type, payload) {
  return new Promise((resolve,reject) => chrome.runtime.sendMessage({ channel:"saurus-account", type, payload }, (response) => {
    if(chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    if(!response?.ok) return reject(new Error(response?.error || "Please try again."));
    resolve(response.data);
  }));
}
function screen(html, compact=false) {
  document.body.classList.toggle("compact",compact);feedback.textContent="";
  content.innerHTML=html; // Static application templates only; never server/user text.
  content.querySelector("h1")?.setAttribute("tabindex","-1");
  content.querySelector("h1")?.focus();
}
function welcome() {
  screen(`<div class="card center"><div class="eyebrow">SMALL STEPS. BIG DISCOVERIES.</div><h1 id="heading">Meet your new<br>learning companion.</h1><p>Turn every webpage into a<br>language-learning adventure.</p><button class="primary" id="signup">Get Started <span aria-hidden="true">↗</span></button><button class="secondary" id="signin">I already have an account</button></div>`);
  document.querySelector("#signup").onclick=()=>form("signup");document.querySelector("#signin").onclick=()=>form("signin");
}
function passwordField(id,label,autocomplete) {
  return `<div class="field"><label for="${id}">${label}</label><div class="input-wrap"><input id="${id}" name="${id}" type="password" autocomplete="${autocomplete}" required aria-describedby="${id}-error"><button class="reveal" type="button" data-target="${id}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false">Show</button></div><p class="error" id="${id}-error"></p></div>`;
}
function form(mode) {
  const signup=mode==="signup";
  screen(`<div class="card"><div class="eyebrow">${signup?"YOUR NEXT CHAPTER":"GOOD TO SEE YOU AGAIN"}</div><h1 id="heading">${signup?"A little curiosity.<br>A whole new world.":"Welcome back."}</h1><p>${signup?"Create your account. Your companion will remember the rest.":"Your dinosaur—and your progress—are waiting."}</p><form novalidate><div class="field"><label for="email">Email address</label><input id="email" type="email" name="email" autocomplete="email" placeholder="you@example.com" required aria-describedby="email-error"><p class="error" id="email-error"></p></div>${passwordField("password","Password",signup?"new-password":"current-password")}${signup?'<p class="hint" style="margin-top:-8px;margin-bottom:12px">At least 8 characters. Make it something only you know.</p>'+passwordField("confirm","Confirm password","new-password"):""}<button class="primary" type="submit">${signup?"Create Account":"Log In"}</button></form><p class="switch">${signup?"Already a companion?":"New around here?"} <button class="link" id="switch">${signup?"Log In":"Sign Up"}</button></p></div>`,true);
  document.querySelectorAll(".reveal").forEach((button)=>button.onclick=()=>{const input=document.getElementById(button.dataset.target);const show=input.type==="password";input.type=show?"text":"password";button.textContent=show?"Hide":"Show";button.setAttribute("aria-pressed",String(show));button.setAttribute("aria-label",`${show?"Hide":"Show"} ${button.dataset.target} password`);});
  content.querySelectorAll("input").forEach(input=>input.addEventListener("input",()=>{input.removeAttribute("aria-invalid");document.getElementById(input.id+"-error").textContent="";}));
  document.querySelector("#switch").onclick=()=>form(signup?"signin":"signup");
  content.querySelector("form").onsubmit=async(event)=>{
    event.preventDefault();feedback.textContent="";
    const email=document.querySelector("#email"),password=document.querySelector("#password"),confirm=document.querySelector("#confirm");
    const errors=[[email,email.validity.valid?"":"Please enter a valid email address."],[password,password.value.length>=(signup?8:1)?"":signup?"Please use at least 8 characters.":"Please enter your password."]];
    if(signup) errors.push([confirm,confirm.value===password.value?"":"Your passwords don’t match yet."]);
    for(const [input,error] of errors){input.setAttribute("aria-invalid",String(!!error));document.getElementById(input.id+"-error").textContent=error;}
    const invalid=errors.find(([,error])=>error);if(invalid){invalid[0].focus();return;}
    const button=event.target.querySelector("button[type=submit]");button.disabled=true;button.classList.add("busy");
    try {
      const state=await request(mode,{email:email.value.trim(),password:password.value});
      password.value="";if(confirm)confirm.value="";
      if(state.verification){screen('<div class="center card"><div class="eyebrow">ONE LITTLE STEP</div><h1 id="heading">Check your inbox.</h1><p>If this address can be registered, you’ll receive a confirmation email. Follow its link, then return here to log in. Already have an account? You can log in now.</p><button id="login" class="primary">Back to Log In</button></div>');document.querySelector("#login").onclick=()=>form("signin");}
      else await route(state);
    }catch(error){feedback.textContent=error.message;}finally{button.disabled=false;button.classList.remove("busy");}
  };
}
function onboarding(){
  screen(`<div class="card"><div class="eyebrow">MAKE YOURSELF AT HOME</div><h1 id="heading">Where shall we go?</h1><p>Pick a language. You can always explore another later.</p><div class="languages">${Object.entries(languages).map(([code,[flag,name]])=>`<button class="language" data-code="${code}" aria-pressed="${code===chosenLanguage}"><span aria-hidden="true">${flag}</span>${name}</button>`).join("")}</div><div class="stage">✦ Start as a hatchling · Age 1 of 4<br>Your companion grows alongside you.</div><button id="begin" class="primary">Let’s begin <span aria-hidden="true">→</span></button></div>`);
  document.querySelectorAll(".language").forEach(button=>button.onclick=()=>{chosenLanguage=button.dataset.code;document.querySelectorAll(".language").forEach(b=>b.setAttribute("aria-pressed",String(b===button)));document.querySelector("#dinosaur").src=`assets/saurus-${chosenLanguage}-1.png`;});
  document.querySelector("#begin").onclick=async(event)=>{event.target.disabled=true;try{await request("memory",{op:"onboard",args:{language:chosenLanguage}});screen('<div class="center card"><div class="eyebrow">YOU’RE IN GOOD COMPANY</div><h1 id="heading">Your learning adventure starts now!</h1><p>A whole world of little discoveries is waiting in your next tab.</p><button id="launch" class="primary">Launch Saurus ↗</button></div>');document.querySelector("#launch").onclick=launch;}catch(error){feedback.textContent=error.message;event.target.disabled=false;}};
}
async function launch(){
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw new Error();await chrome.tabs.sendMessage(tab.id,{channel:"saurus-launch"});window.close();}
  catch(_){feedback.textContent="Open a regular webpage, refresh it if needed, then press Option+S (Alt+S on Windows).";}
}
async function route(state,autoLaunch=true){
  account=state;
  if(!state.user){welcome();return;}
  if(!state.profile?.onboarded){onboarding();return;}
  document.querySelector("#dinosaur").src=`assets/saurus-${state.profile.language}-1.png`;
  screen('<div class="center card"><div class="eyebrow">YOUR ADVENTURE CONTINUES</div><h1 id="heading">Ready when you are.</h1><p id="identity"></p><button id="launch" class="primary">Open Saurus ↗</button><button id="logout" class="link">Sign out</button></div>');
  document.querySelector("#identity").textContent=state.offline?"You’re still signed in. Your cloud progress will return when you’re online.":"Your companion remembers you. Let’s pick up where you left off.";
  document.querySelector("#launch").onclick=launch;
  document.querySelector("#logout").onclick=async()=>{try{await request("signout");account=null;welcome();}catch(error){feedback.textContent=error.message;}};
  // Account view can be reached with popup.html#account; normal action opens immediately.
  if(autoLaunch && location.hash!=="#account") await launch();
}
document.querySelector(".brand").onclick=(event)=>{event.preventDefault();account?.user?route(account,false):welcome();};
screen('<div class="center"><h1 id="heading">Finding your companion…</h1><p>Just a moment.</p></div>');
request("status").then(state=>route(state)).catch(error=>{screen('<div class="center"><h1 id="heading">Let’s reconnect.</h1><p>Your saved session hasn’t been erased.</p><button id="retry" class="primary">Try again</button></div>');feedback.textContent=error.message;document.querySelector("#retry").onclick=()=>location.reload();});
