/*
 * offscreen.js — records the microphone for Saurus in an extension page,
 * converts it to 16 kHz 16-bit mono PCM and sends it out in ~40 ms chunks
 * (base64) while push-to-talk is held. See background.js.
 */
"use strict";

class Downsampler {
  constructor(inRate, outRate) { this.ratio = inRate / outRate; this.pos = 0; this.rest = new Float32Array(0); }
  push(input) {
    const data = new Float32Array(this.rest.length + input.length);
    data.set(this.rest); data.set(input, this.rest.length);
    const out = [];
    const r = this.ratio;
    while (this.pos + r <= data.length) {
      const a = Math.floor(this.pos);
      const b = Math.max(a + 1, Math.floor(this.pos + r));
      let sum = 0;
      for (let i = a; i < b; i++) sum += data[i];
      const v = Math.max(-1, Math.min(1, sum / (b - a)));
      out.push(v < 0 ? v * 32768 : v * 32767);
      this.pos += r;
    }
    const keep = Math.floor(this.pos);
    this.rest = data.slice(keep);
    this.pos -= keep;
    return Int16Array.from(out);
  }
}

function toBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

let stream = null, ctx = null, proc = null, sending = false, ds = null;

async function open() {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  proc = ctx.createScriptProcessor(2048, 1, 1);
  const sink = ctx.createGain();
  sink.gain.value = 0;
  proc.onaudioprocess = (e) => {
    if (!sending || !ds) return;
    const pcm = ds.push(e.inputBuffer.getChannelData(0));
    if (pcm.length) chrome.runtime.sendMessage({ target: "background", type: "chunk", data: toBase64(pcm) }).catch(() => {});
  };
  src.connect(proc); proc.connect(sink); sink.connect(ctx.destination);
}

function release() {
  sending = false;
  if (proc) proc.onaudioprocess = null;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  if (ctx) ctx.close().catch(() => {});
  stream = ctx = proc = ds = null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== "offscreen") return;
  if (msg.type === "start") {
    open().then(async () => {
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});
      ds = new Downsampler(ctx.sampleRate, 16000);
      sending = true;
      sendResponse({ ok: true, rate: ctx.sampleRate });
    }, (e) => {
      release();
      sendResponse({ ok: false, name: (e && e.name) || "Error", message: (e && e.message) || String(e) });
    });
    return true; // async response
  }
  if (msg.type === "stop") { sending = false; sendResponse({ ok: true }); }
  if (msg.type === "release") { release(); sendResponse({ ok: true }); }
});
