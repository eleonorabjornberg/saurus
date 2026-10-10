/*
 * background.js — routes push-to-talk audio for the extension.
 *
 * Content scripts run with each website's origin, so recording there makes
 * Chrome ask for the microphone on every site. Instead the microphone is
 * opened in an offscreen extension page (offscreen.html), which needs the
 * permission only once for the whole extension (granted on mic-setup.html).
 *
 * Content script <-port "saurus-mic"-> background <-messages-> offscreen
 */
"use strict";

let talker = null;        // the port of the tab currently talking
let creating = null;

async function ensureOffscreen() {
  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["USER_MEDIA"],
      justification: "Saurus push-to-talk records the microphone once for all sites.",
    }).catch((e) => { if (!/single offscreen/i.test(String(e && e.message))) throw e; })
      .finally(() => { creating = null; });
  }
  await creating;
}

function toOffscreen(type) {
  return chrome.runtime.sendMessage({ target: "offscreen", type }).catch(() => null);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "saurus-mic") return;
  port.onMessage.addListener(async (msg) => {
    if (!msg) return;
    if (msg.type === "start") {
      talker = port;
      try {
        await ensureOffscreen();
        const r = await toOffscreen("start");
        if (r && r.ok) { port.postMessage({ type: "started", rate: r.rate }); return; }
        const name = (r && r.name) || "Error";
        if (name === "NotAllowedError" || name === "SecurityError") {
          chrome.tabs.create({ url: chrome.runtime.getURL("mic-setup.html") });
        }
        port.postMessage({ type: "error", name, message: (r && r.message) || "microphone unavailable" });
      } catch (e) {
        port.postMessage({ type: "error", name: "Error", message: String((e && e.message) || e) });
      }
    } else if (msg.type === "stop") {
      if (talker === port) toOffscreen("stop");
    } else if (msg.type === "release") {
      if (talker === port) { talker = null; toOffscreen("release"); }
    }
  });
  port.onDisconnect.addListener(() => {
    if (talker === port) { talker = null; toOffscreen("release"); }
  });
});

// A screenshot of the tab Saurus was opened in (for Docs, Slides and web
// apps, whose text isn't readable from the page). Only the visible tab.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target !== "background" || msg.type !== "snapshot") return;
  if (!sender.tab || !sender.tab.active) { sendResponse({}); return; }
  chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: "jpeg", quality: 60 })
    .then((dataUrl) => sendResponse({ dataUrl }), () => sendResponse({}));
  return true; // async response
});

// Audio chunks from the offscreen page go to the tab that is talking.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.target === "background" && msg.type === "chunk" && talker) {
    try { talker.postMessage({ type: "chunk", data: msg.data }); } catch (_) { talker = null; }
  }
});
