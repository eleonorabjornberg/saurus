/*
 * captcha.js — Cloudflare Turnstile for Saurus's sign-up, log-in and
 * password reset, when SAURUS_SUPABASE.captchaSiteKey is set. The popup and
 * the web panel show this page in a small frame (an extension page can't
 * load Cloudflare's script itself) and receive only the one-time token:
 *   captcha.html?k=<site key>&o=<origin of the page embedding it>
 */
(function () {
  "use strict";
  const q = new URLSearchParams(location.search);
  const key = q.get("k") || "";
  const o = q.get("o") || "";
  let to = /^chrome-extension:\/\/[a-p]{32}$/.test(o) ? o : ""; // the extension's popup
  if (!to) try { to = new URL(o).origin; } catch (_) {}
  const tell = (token) => { if (to && to !== "null") parent.postMessage({ saurusCaptcha: token }, to); };
  window.saurusCaptchaReady = () => {
    window.turnstile.render("#box", {
      sitekey: key, size: "flexible", theme: "light",
      callback: (token) => tell(token),
      "expired-callback": () => tell(null),
      "error-callback": () => tell(null),
    });
  };
})();
