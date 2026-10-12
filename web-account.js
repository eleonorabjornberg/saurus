/*
 * web-account.js — Saurus accounts on the demo page and the bookmarklet.
 *
 * The page-context twin of auth-bridge.js: the same window.SaurusAccount
 * (request, require, memory, ticket, current), backed by auth-service.js
 * running here instead of in the extension's worker, plus a small sign-in
 * panel in Saurus's style. Load it after supabase-config.js and
 * auth-service.js, before backend-gemini.js.
 *
 * It only ever runs in a page's own world. The extension's content scripts
 * live in an isolated world with their own SaurusAccount, so its session is
 * never exposed here, and this file steps aside if a bridge already exists.
 *
 * The session is kept in localStorage only on Saurus's own site (the demo
 * page). On other sites (the bookmarklet) it is kept in memory for that tab,
 * so no Saurus token is left behind in a website's storage.
 */
(function () {
  "use strict";
  if (window.SaurusAccount) return;
  const cfg = window.SAURUS_SUPABASE || {};
  if (!cfg.url || !cfg.anonKey || !window.SaurusAuthService) return;

  const script = document.currentScript && document.currentScript.src;
  const base = script ? new URL(".", script).href : new URL(".", location.href).href;
  const ownSite = new URL(base).origin === location.origin;
  const LANGUAGES = { fr: ["🇫🇷", "French"], de: ["🇩🇪", "German"], es: ["🇪🇸", "Spanish"], sv: ["🇸🇪", "Swedish"], hi: ["🇮🇳", "Hindi"], it: ["🇮🇹", "Italian"], pt: ["🇧🇷", "Portuguese (Brazil)"], zh: ["🇨🇳", "Mandarin"] };

  // Storage with chrome.storage.local's shape, as auth-service.js expects.
  const memoryStore = new Map();
  const PREFIX = "saurus-web:";
  const storage = {
    async get(key) {
      let v;
      try { v = ownSite ? JSON.parse(localStorage.getItem(PREFIX + key) ?? "null") : memoryStore.get(key); } catch (_) { v = null; }
      return v == null ? {} : { [key]: v };
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) {
        try { if (ownSite) localStorage.setItem(PREFIX + k, JSON.stringify(v)); else memoryStore.set(k, v); } catch (_) {}
      }
    },
    async remove(key) {
      for (const k of [].concat(key)) {
        try { if (ownSite) localStorage.removeItem(PREFIX + k); else memoryStore.delete(k); } catch (_) {}
      }
    },
  };

  // The Supabase library, loaded on first use. Its bundle declares a global
  // `supabase`; put back whatever the site had there.
  let service = null;
  function getService() {
    if (!service) {
      service = new Promise((resolve, reject) => {
        const before = window.supabase;
        const s = document.createElement("script");
        s.src = base + "vendor/supabase.js";
        s.onload = () => {
          const lib = window.supabase;
          try { window.supabase = before; } catch (_) {}
          if (!lib || !lib.createClient) return reject(new Error("Saurus couldn’t load sign-in"));
          resolve(window.SaurusAuthService.createAuthService({ createClient: lib.createClient, config: cfg, storage }));
        };
        s.onerror = () => reject(new Error("Saurus couldn’t load sign-in. Check your connection"));
        (document.head || document.documentElement).appendChild(s);
      });
      service.catch(() => { service = null; }); // try again next time
    }
    return service;
  }

  let userId = null;
  const account = {
    async request(type, payload) {
      if (type === "open") { panel(await account.request("status").catch(() => ({ user: null }))); return true; }
      return (await getService()).handle(type, payload);
    },
    current: null, // {user, profile} once signed in
    async require() {
      const state = await this.request("status");
      if (!state.user || !(state.profile && state.profile.onboarded)) {
        this.current = null;
        panel(state);
        return null;
      }
      userId = state.user.id;
      this.current = state;
      return state;
    },
    memory(op, args) { return this.request("memory", { op, args, expectedUserId: userId }); },
    ticket() { return this.request("ticket", { expectedUserId: userId }); },
  };
  window.SaurusAccount = account;

  // -------------------------------------------------------------------------
  // The panel: sign in / sign up, "check your email", first language, account.
  // Built with DOM calls (no innerHTML), so it works on pages with Trusted Types.
  // -------------------------------------------------------------------------
  let host = null, root = null, body = null, note = null;
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids.flat().filter((k) => k != null));
    return el;
  }
  const CSS = `
    :host{all:initial}
    .back{position:fixed;inset:0;z-index:2147483647;background:#1d2d2433;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#243d32}
    .card{position:relative;width:100%;max-width:380px;max-height:calc(100vh - 32px);overflow:auto;background:#f7f8ee;background-image:radial-gradient(ellipse at 85% 10%,#e0edda 0,transparent 50%),radial-gradient(ellipse at 0 80%,#fff1d6 0,transparent 60%);border-radius:22px;padding:24px 24px 18px;box-shadow:0 20px 50px #1d2d2440;box-sizing:border-box;animation:enter .2s ease-out}
    @keyframes enter{from{opacity:0;transform:translateY(8px)}}
    *{box-sizing:border-box}
    .brand{font-size:22px;letter-spacing:-1.2px;font-weight:850;color:#244b38}.brand span{font-size:16px;color:#e1a651;margin-left:3px}
    .close{position:absolute;right:12px;top:10px;border:0;background:none;font-size:22px;color:#71806c;cursor:pointer;padding:6px 10px}
    .pet{display:block;height:96px;margin:6px auto 4px;object-fit:contain}
    .eyebrow{font-size:9px;font-weight:750;letter-spacing:1.8px;text-transform:uppercase;color:#74916a;margin:6px 0 8px}
    h1{font-size:24px;line-height:1.15;letter-spacing:-1px;margin:0 0 10px;font-weight:750}
    p{font-size:13px;line-height:1.6;color:#69766a;margin:0 0 16px}
    label{display:block;font-size:12px;font-weight:650;margin:0 0 6px;color:#3b5943}
    input{display:block;width:100%;font:inherit;font-size:16px;padding:11px 13px;border:1px solid #dce3d3;border-radius:12px;background:#fff;color:#243d32;margin:0 0 12px}
    input:focus{outline:2px solid #437750;outline-offset:1px}
    button{font:inherit;cursor:pointer}
    .primary{display:block;width:100%;border:1px solid #315b40;background:linear-gradient(#437750,#315b40);color:#fff;border-radius:13px;padding:13px 18px;font-size:14px;font-weight:650;margin-top:4px}
    .primary:disabled{opacity:.6;cursor:wait}
    .link{display:block;margin:12px auto 0;background:none;border:0;color:#3d714d;font-size:13px;padding:8px;text-decoration:underline;text-underline-offset:3px}
    .langs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px}
    .lang{border:1px solid #dce3d3;background:#ffffffaa;border-radius:12px;padding:11px 8px;font-size:13px;color:#243d32;text-align:left}
    .lang span{margin-right:7px}
    .lang[aria-pressed=true]{border-color:#437750;background:#e5efda;font-weight:650}
    .stage{font-size:12px;color:#69766a;background:#ffffff88;border-radius:12px;padding:10px 12px;margin:0 0 14px;line-height:1.5}
    .captcha{display:block;width:100%;height:72px;border:0;margin:0 0 12px;background:transparent}
    .danger{border-color:#8f3a2e;background:linear-gradient(#b1503f,#8f3a2e)}
    .quiet{color:#8a6f68;font-size:12px;margin-top:0}
    .note{min-height:1em;font-size:12px;color:#a2473a;margin:10px 0 0;text-align:center}
    @media (max-width:520px){.back{align-items:flex-end;padding:0}.card{max-width:none;border-radius:22px 22px 0 0;max-height:92vh;padding-bottom:max(18px,env(safe-area-inset-bottom))}}
  `;
  function open() {
    if (!host) {
      host = h("saurus-account");
      root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = CSS;
      body = h("div", {});
      note = h("p", { class: "note", role: "status", "aria-live": "polite" });
      const card = h("div", { class: "card", role: "dialog", "aria-modal": "true", "aria-label": "Saurus account" },
        h("button", { class: "close", "aria-label": "Close", onclick: close }, "×"),
        h("div", { class: "brand" }, "saurus", h("span", {}, "✦")), body, note);
      const back = h("div", { class: "back", onclick: (e) => { if (e.target === back) close(); } }, card);
      root.append(style, back);
      root.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); }); // typing here isn't a Saurus shortcut
    }
    document.documentElement.appendChild(host); // last, so it sits above Saurus itself
  }
  function close() { if (host) host.remove(); }
  function screen(...kids) {
    open();
    note.textContent = "";
    body.replaceChildren(...kids);
    // Focus now, not on a timer: a late focus could pull an autofill or a fast
    // typist out of the field they're already in.
    const first = body.querySelector("input, .primary");
    if (first) first.focus({ preventScroll: true });
  }
  const pet = (lang) => {
    const img = h("img", { class: "pet", alt: "", src: base + (lang ? `assets/saurus-${lang}-1.png` : "assets/saurus-plain.png") });
    img.addEventListener("error", () => { img.src = base + "assets/saurus-plain.png"; }, { once: true });
    return img;
  };
  async function busy(button, fn) {
    button.disabled = true; note.textContent = "";
    try { await fn(); } catch (err) { note.textContent = String((err && err.message) || err); } finally { button.disabled = false; }
  }
  // CAPTCHA (Cloudflare Turnstile) in a frame from Saurus's site, only when a site key is set.
  function captcha() {
    if (!cfg.captchaSiteKey) return null;
    const src = new URL("captcha.html", base);
    src.search = new URLSearchParams({ k: cfg.captchaSiteKey, o: location.origin }).toString();
    const frame = h("iframe", { class: "captcha", title: "Check that you’re not a robot", src: src.href });
    const box = { el: frame, token: null, reset() { box.token = null; frame.src = src.href; } }; // tokens work once
    window.addEventListener("message", (e) => {
      if (e.source === frame.contentWindow && e.data && "saurusCaptcha" in e.data) box.token = e.data.saurusCaptcha || null;
    });
    return box;
  }
  function needsCaptcha(cap) {
    if (cap && !cap.token) { note.textContent = "Please complete the check that you’re not a robot first."; return true; }
    return false;
  }
  // Saurus opens itself with Alt+S; on a page that also works as a synthetic key.
  const summon = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", key: "s", altKey: true, bubbles: true }));

  function panel(state) {
    if (!state || !state.user) return form("signin");
    if (!(state.profile && state.profile.onboarded)) return onboarding();
    signedIn(state);
  }

  function form(mode) {
    const signup = mode === "signup";
    const email = h("input", { id: "email", type: "email", autocomplete: "email", placeholder: "you@example.com", required: "" });
    const password = h("input", { id: "password", type: "password", autocomplete: signup ? "new-password" : "current-password", required: "" });
    const confirm = signup ? h("input", { id: "confirm", type: "password", autocomplete: "new-password", required: "" }) : null;
    const submit = h("button", { class: "primary", type: "submit" }, signup ? "Create account" : "Log in");
    const cap = captcha();
    const f = h("form", { novalidate: "", onsubmit: (e) => {
      e.preventDefault();
      if (!email.validity.valid || !email.value.trim()) { note.textContent = "Please enter a valid email address."; return email.focus(); }
      if (password.value.length < (signup ? 8 : 1)) { note.textContent = signup ? "Please use at least 8 characters." : "Please enter your password."; return password.focus(); }
      if (signup && confirm.value !== password.value) { note.textContent = "Your passwords don’t match yet."; return confirm.focus(); }
      if (needsCaptcha(cap)) return;
      busy(submit, async () => {
        const state = await account.request(mode, { email: email.value.trim(), password: password.value, captchaToken: cap && cap.token })
          .finally(() => cap && cap.reset());
        password.value = ""; if (confirm) confirm.value = "";
        if (state.verification) return checkEmail();
        if (state.user && state.profile && state.profile.onboarded) { close(); summon(); } else panel(state);
      });
    } },
      h("label", { for: "email" }, "Email address"), email,
      h("label", { for: "password" }, "Password"), password,
      signup ? [h("label", { for: "confirm" }, "Confirm password"), confirm] : null,
      cap && cap.el, submit);
    screen(pet(),
      h("div", { class: "eyebrow" }, signup ? "Your next chapter" : "Good to see you again"),
      h("h1", {}, signup ? "Create your account." : "Log in to Saurus."),
      h("p", {}, signup ? "Free every day. Your companion remembers your progress on every device." : "Your dinosaur—and your progress—are waiting."),
      f,
      signup ? null : h("button", { class: "link", type: "button", onclick: () => forgot(email.value) }, "Forgot password?"),
      h("button", { class: "link", type: "button", onclick: () => form(signup ? "signin" : "signup") }, signup ? "Already have an account? Log in" : "New here? Create an account"));
  }

  // "Forgot password?": Supabase emails a link to reset.html on Saurus's site.
  function forgot(prefill) {
    const email = h("input", { id: "email", type: "email", autocomplete: "email", placeholder: "you@example.com", required: "" });
    email.value = prefill || "";
    const submit = h("button", { class: "primary", type: "submit" }, "Send reset link");
    const cap = captcha();
    const f = h("form", { novalidate: "", onsubmit: (e) => {
      e.preventDefault();
      if (!email.validity.valid || !email.value.trim()) { note.textContent = "Please enter a valid email address."; return email.focus(); }
      if (needsCaptcha(cap)) return;
      busy(submit, async () => {
        await account.request("reset", { email: email.value.trim(), captchaToken: cap && cap.token }).finally(() => cap && cap.reset());
        screen(pet(),
          h("div", { class: "eyebrow" }, "One little step"),
          h("h1", {}, "Check your email."),
          h("p", {}, "If an account uses this address, a link to choose a new password is on its way. It works once, for a short while."),
          h("button", { class: "primary", type: "button", onclick: () => form("signin") }, "Back to log in"));
      });
    } }, h("label", { for: "email" }, "Email address"), email, cap && cap.el, submit);
    screen(pet(),
      h("div", { class: "eyebrow" }, "It happens to everyone"),
      h("h1", {}, "Forgot your password?"),
      h("p", {}, "Enter your email and we’ll send you a link to choose a new one."),
      f,
      h("button", { class: "link", type: "button", onclick: () => form("signin") }, "Back to log in"));
  }

  // Delete the account and everything Saurus keeps for it, after the password again.
  function deleteAccount(state) {
    const password = h("input", { id: "password", type: "password", autocomplete: "current-password", required: "" });
    const submit = h("button", { class: "primary danger", type: "submit" }, "Delete my account");
    const cap = captcha();
    const f = h("form", { novalidate: "", onsubmit: (e) => {
      e.preventDefault();
      if (!password.value) { note.textContent = "Please enter your password."; return password.focus(); }
      if (needsCaptcha(cap)) return;
      busy(submit, async () => {
        await account.request("delete", { password: password.value, captchaToken: cap && cap.token }).finally(() => cap && cap.reset());
        password.value = "";
        account.current = null; userId = null;
        screen(pet(),
          h("div", { class: "eyebrow" }, "All cleared"),
          h("h1", {}, "Your account is deleted."),
          h("p", {}, "Everything Saurus kept for it is gone. You’re welcome back any time."),
          h("button", { class: "primary", type: "button", onclick: () => { close(); location.reload(); } }, "Done"));
      });
    } }, h("label", { for: "password" }, "Your password"), password, cap && cap.el, submit);
    screen(pet(),
      h("div", { class: "eyebrow" }, "Delete account"),
      h("h1", {}, "Delete your account?"),
      h("p", {}, "This removes your account and everything Saurus remembers for it: your levels, words, answers and conversation summaries, in every language. It can’t be undone."),
      f,
      h("button", { class: "link", type: "button", onclick: () => signedIn(state) }, "Keep my account"));
  }

  function checkEmail() {
    screen(pet(),
      h("div", { class: "eyebrow" }, "One little step"),
      h("h1", {}, "Check your email."),
      h("p", {}, "If this address can be registered, a confirmation email is on its way. Follow its link, then come back here and log in."),
      h("button", { class: "primary", type: "button", onclick: () => form("signin") }, "Back to log in"));
  }

  function onboarding() {
    let chosen = "de";
    const img = pet(chosen);
    const buttons = Object.entries(LANGUAGES).map(([code, [flag, name]]) => h("button", {
      class: "lang", type: "button", "aria-pressed": String(code === chosen),
      onclick: (e) => {
        chosen = code;
        for (const b of buttons) b.setAttribute("aria-pressed", String(b === e.currentTarget));
        img.src = base + `assets/saurus-${code}-1.png`;
      },
    }, h("span", { "aria-hidden": "true" }, flag), name));
    const begin = h("button", { class: "primary", type: "button", onclick: () => busy(begin, async () => {
      await account.request("memory", { op: "onboard", args: { language: chosen } });
      close(); summon();
    }) }, "Let’s begin →");
    screen(img,
      h("div", { class: "eyebrow" }, "Make yourself at home"),
      h("h1", {}, "Where shall we go?"),
      h("p", {}, "Pick a language. You can always explore another later."),
      h("div", { class: "langs" }, buttons),
      h("div", { class: "stage" }, "✦ Start as a hatchling · Age 1 of 4. Your companion grows alongside you."),
      begin);
  }

  function signedIn(state) {
    const out = h("button", { class: "link", type: "button", onclick: () => busy(out, async () => {
      await account.request("signout");
      account.current = null; userId = null;
      close();
      location.reload(); // drop the running tutor with the account
    }) }, "Sign out");
    screen(pet(state.profile.language),
      h("div", { class: "eyebrow" }, "Your adventure continues"),
      h("h1", {}, "Ready when you are."),
      h("p", {}, `Signed in as ${state.user.email || "you"}.`),
      h("button", { class: "primary", type: "button", onclick: () => { close(); summon(); } }, "Open Saurus"),
      out,
      h("button", { class: "link quiet", type: "button", onclick: () => deleteAccount(state) }, "Delete account"));
  }
})();
