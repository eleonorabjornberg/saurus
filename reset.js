/*
 * reset.js — the page a password-reset email links to (reset.html on
 * Saurus's site). Supabase puts a short-lived recovery session in the link;
 * this page uses it only to set the new password, keeps it in memory, and
 * signs it out afterwards. People then log in as usual, in the extension
 * or on the demo page.
 */
(function () {
  "use strict";
  const content = document.querySelector("#content");
  const feedback = document.querySelector("#feedback");
  const cfg = window.SAURUS_SUPABASE || {};
  const say = (heading, text, extra) => {
    content.replaceChildren();
    const card = document.createElement("div"); card.className = "card center";
    const h1 = document.createElement("h1"); h1.id = "heading"; h1.textContent = heading;
    const p = document.createElement("p"); p.textContent = text;
    card.append(h1, p);
    if (extra) card.append(extra);
    content.append(card);
    feedback.textContent = "";
  };
  const back = () => { const a = document.createElement("a"); a.className = "primary button-link"; a.href = "demo.html"; a.textContent = "Go to Saurus"; return a; };

  // An expired or used link comes back with the error in the address.
  const params = new URLSearchParams(location.hash.slice(1) + "&" + location.search.slice(1));
  if (params.get("error") || params.get("error_code")) {
    history.replaceState(null, "", location.pathname);
    return say("This link has expired.", "Reset links work once and only for a short while. Ask Saurus for a new one: “Forgot password?” on the log-in screen.", back());
  }
  if (!cfg.url || !cfg.anonKey || !window.supabase) return say("Saurus isn’t set up here.", "This page needs Saurus’s Supabase settings.");
  const client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: {
    storageKey: "saurus.reset", persistSession: false, autoRefreshToken: false, detectSessionInUrl: true,
  } });

  client.auth.getSession().then(({ data }) => {
    if (!data.session) return say("Open the link from your email.", "To choose a new password, use the link in the email Saurus sent you. Ask for a new one with “Forgot password?” on the log-in screen.", back());
    form(data.session.user.email || "");
  }, () => say("Let’s try that again.", "Saurus couldn’t check your link. Check your connection and reload this page."));

  function field(id, label) {
    const wrap = document.createElement("div"); wrap.className = "field";
    const l = document.createElement("label"); l.htmlFor = id; l.textContent = label;
    const input = document.createElement("input"); input.id = id; input.type = "password"; input.autocomplete = "new-password"; input.required = true;
    wrap.append(l, input);
    return [wrap, input];
  }
  function form(email) {
    content.replaceChildren();
    const card = document.createElement("div"); card.className = "card";
    const eyebrow = document.createElement("div"); eyebrow.className = "eyebrow"; eyebrow.textContent = "A FRESH START";
    const h1 = document.createElement("h1"); h1.id = "heading"; h1.textContent = "Choose a new password.";
    const p = document.createElement("p"); p.textContent = email ? `For ${email}. At least 8 characters.` : "At least 8 characters.";
    const [w1, pw] = field("password", "New password");
    const [w2, confirm] = field("confirm", "Confirm new password");
    const submit = document.createElement("button"); submit.className = "primary"; submit.type = "submit"; submit.textContent = "Save new password";
    const f = document.createElement("form"); f.noValidate = true; f.append(w1, w2, submit);
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); feedback.textContent = "";
      if (pw.value.length < 8) { feedback.textContent = "Please use at least 8 characters."; return pw.focus(); }
      if (confirm.value !== pw.value) { feedback.textContent = "Your passwords don’t match yet."; return confirm.focus(); }
      submit.disabled = true;
      const { error } = await client.auth.updateUser({ password: pw.value });
      submit.disabled = false;
      if (error) {
        const messages = {
          same_password: "That’s your current password. Please choose a new one.",
          weak_password: "Please choose a stronger password.",
          session_expired: "This link has expired. Ask Saurus for a new one.",
        };
        feedback.textContent = messages[error.code] || "Your password couldn’t be saved. Check your connection and try again.";
        return;
      }
      pw.value = confirm.value = "";
      await client.auth.signOut({ scope: "local" }).catch(() => {});
      say("Password changed.", "Log in to Saurus with your new password: in the extension’s popup, or on the demo page.", back());
    });
    card.append(eyebrow, h1, p, f);
    content.append(card);
    pw.focus();
  }
})();
