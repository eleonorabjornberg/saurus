/* MV3 service worker: the only extension context allowed to call the local API. */
"use strict";

if (typeof importScripts === "function") {
  importScripts("supabase-config.js", "vendor/supabase.js", "auth-service.js");
  const ready = chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" }).then(() => {
    const account = SaurusAuthService.createAuthService({
      createClient: supabase.createClient, config: SAURUS_SUPABASE, storage: chrome.storage.local,
      notify(event) {
        chrome.tabs.query({}).then((tabs) => Promise.allSettled(tabs.map((tab) =>
          chrome.tabs.sendMessage(tab.id, { channel: "saurus-account-changed", event })))).catch(() => {});
      },
    });
    chrome.alarms.create("saurus-session", { periodInMinutes: 1 });
    return account;
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "saurus-session") ready.then((a) => a.refresh()).catch(() => {});
  });
  chrome.runtime.onStartup.addListener(() => {
    chrome.alarms.create("saurus-session", { periodInMinutes: 1 });
    ready.then((a) => a.refresh()).catch(() => {});
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (message?.channel !== "saurus-account") return false;
    const trustedUI = sender.id === chrome.runtime.id && String(sender.url || "").split(/[?#]/)[0] === chrome.runtime.getURL("popup.html");
    (async () => {
      if (sender.id !== chrome.runtime.id) throw new Error("Untrusted sender.");
      if (["signin", "signup", "signout"].includes(message.type) && !trustedUI) throw new Error("Open the Saurus popup to manage your account.");
      if (message.type === "memory" && !trustedUI && !message.payload?.expectedUserId) throw new Error("Open Saurus again to restore your account.");
      if (message.type === "open") {
        try { await chrome.action.openPopup(); }
        catch (_) { await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") }); }
        return true;
      }
      return (await ready).handle(message.type, message.payload);
    })().then((data) => respond({ ok: true, data }), (error) => respond({ ok: false, error: error.message }));
    return true;
  });
}

const API_BASE = "http://127.0.0.1:3000";
const ROUTES = Object.freeze({
  learner: ["GET", "/api/learner"],
  adapt: ["POST", "/api/reading/adapt"],
  recall: ["POST", "/api/vocabulary/recall"],
  progress: ["GET", "/api/learning/progress"],
  nextAction: ["GET", "/api/learning/next-action"],
});

async function requestBackend(type, body, fetchImpl = fetch) {
  const route = ROUTES[type];
  if (!route) throw new Error("Unsupported Saurus API operation");
  const [method, path] = route;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const response = await fetchImpl(API_BASE + path, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Saurus API returned ${response.status}`);
    return payload;
  } finally { clearTimeout(timer); }
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.channel !== "saurus-api") return false;
    requestBackend(message.type, message.body)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });
}

if (typeof module !== "undefined") module.exports = { API_BASE, ROUTES, requestBackend };
