/*
 * bookmarklet.js — Saurus on any page without installing anything.
 * The bookmark (see demo.html) loads this file from GitHub Pages; it loads
 * Saurus's scripts from the same place and opens it. Clicking the bookmark
 * again toggles Saurus. Saurus asks you to sign in (web-account.js);
 * on other sites the session is kept for that tab only. Some sites block outside scripts (strict CSP); there,
 * use the extension or the demo page.
 */
(function () {
  "use strict";
  const toggle = () => window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyS", key: "s", altKey: true, bubbles: true }));
  const loaded = document.documentElement.getAttribute("data-saurus-loaded");
  // The Saurus extension is already here: it only answers real key presses.
  if (loaded === "extension") { alert("You have the Saurus extension: press Alt+S (Option+S on a Mac) to open Saurus."); return; }
  if (loaded !== null) { toggle(); return; }
  const base = (document.currentScript && document.currentScript.src) || "https://eleonorabjornberg.github.io/saurus/bookmarklet.js";
  const files = ["config.js", "supabase-config.js", "auth-service.js", "web-account.js", "backend.js", "backend-gemini.js", "backend-mock.js", "saurus.js"];
  (function next(i) {
    if (i >= files.length) { setTimeout(toggle, 50); return; }
    const s = document.createElement("script");
    s.src = new URL(files[i], base).href;
    s.onload = () => next(i + 1);
    s.onerror = () => alert("This site blocks Saurus's scripts. Try another article, or use the Saurus extension.");
    (document.head || document.documentElement).appendChild(s);
  })(0);
})();
