/*
 * backend-gemini.js — SaurusBackend on the Gemini API, straight from the browser.
 *
 * Voice: Gemini Live over a WebSocket (16 kHz PCM in, 24 kHz PCM out, built-in
 * transcripts of both sides, tool calls for highlight / level / drill /
 * celebrate). Page translation: Gemini Flash with structured JSON output.
 *
 * Active when config.js sets geminiApiKey (direct to Google) or apiBase (a
 * proxy, e.g. a Supabase Edge Function that adds the key server-side), and
 * no other backend (backend.js) has set window.SaurusBackend first.
 * Levels and language are remembered in localStorage.
 */
(function () {
  "use strict";
  if (window.SaurusBackend) return;
  const cfg = window.SAURUS_CONFIG || {};
  if (!cfg.geminiApiKey && !cfg.apiBase) return; // no key and no proxy: the mock runs

  const KEY = encodeURIComponent(cfg.geminiApiKey || "");
  const LIVE_MODEL = cfg.liveModel || "gemini-3.8-live";
  const TEXT_MODEL = cfg.textModel || "gemini-3.8-flash";
  const API = (cfg.apiBase || "https://generativelanguage.googleapis.com").replace(/\/$/, "");
  const WS_URL = API.replace(/^http/, "ws") +
    "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=" + KEY;
  const REST_URL = (model) => `${API}/v1beta/models/${model}:generateContent?key=${KEY}`;

  const LANG = { fr: "French", de: "German", es: "Spanish" };
  const LEVEL = {
    1: "total beginner (hatchling): mostly English with a few key words in the target language",
    2: "beginner (juvenile): short, very simple sentences",
    3: "intermediate (adult): simple but complete sentences",
    4: "advanced (elder): natural, fluent speech",
  };

  // ---------------------------------------------------------------------
  // Memory (per language, survives reloads)
  // ---------------------------------------------------------------------
  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch (_) { return fallback; }
  }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) {} }
  const levels = Object.assign({ fr: 1, de: 1, es: 1 }, load("saurus.levels", {}));
  let lang = LANG[load("saurus.language", "")] ? load("saurus.language", "fr") : (LANG[cfg.language] ? cfg.language : "de");

  // ---------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------
  const handlers = {};
  function emit(name, data) {
    for (const h of handlers[name] || []) {
      try { h(data); } catch (e) { console.error("[saurus-gemini] handler error", e); }
    }
  }
  let state = "idle";
  function setState(s) { if (s !== state) { state = s; emit("state", s); } }

  // ---------------------------------------------------------------------
  // Audio helpers
  // ---------------------------------------------------------------------
  function toBase64(int16) {
    const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function fromBase64(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length - (bin.length % 2));
    for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Int16Array(bytes.buffer);
  }

  // ---------------------------------------------------------------------
  // Gemini Live session
  // ---------------------------------------------------------------------
  const TOOLS = [{
    functionDeclarations: [
      { name: "highlight", description: "Highlight a word or short phrase that is visible on the learner's page, e.g. a word they struggle with or the one you are talking about. Use the exact text as it appears on the page.",
        parameters: { type: "OBJECT", properties: { text: { type: "STRING", description: "Exact word or phrase from the page" } }, required: ["text"] } },
      { name: "celebrate", description: "Celebrate when the learner gets something right." },
      { name: "level_up", description: "Raise the learner's level in the current language when they clearly handle the current level with ease." },
      { name: "level_down", description: "Lower the learner's level when they are clearly struggling or ask for easier." },
      { name: "offer_drill", description: "Offer a short five-minute drill when the learner keeps making the same kind of mistake.",
        parameters: { type: "OBJECT", properties: { topic: { type: "STRING", description: "What the drill practices, in a few words" } }, required: ["topic"] } },
    ],
  }];

  let page = { url: "", text: "" };
  let ws = null, live = false, running = false;
  let talking = false, inText = "", outText = "", speaking = false;

  function instructions() {
    return [
      `You are Saurus, a small, warm, patient dinosaur who tutors languages. The learner is learning ${LANG[lang]}.`,
      `Their ${LANG[lang]} level is ${levels[lang]} of 4: ${LEVEL[levels[lang]]}. Speak ${LANG[lang]} at exactly that level.`,
      "Talk about the substance of the page they are reading (the argument, what was decided, what they think), never textbook filler.",
      "Keep each turn short: one to three sentences, usually ending with one question. Correct mistakes gently by repeating the correct form.",
      "Use your tools silently while you talk: highlight words on the page you discuss or the learner struggles with; celebrate correct answers; level_up or level_down when their level clearly changes; offer_drill when the same mistake repeats.",
      "If the learner switches language or asks for easier/harder, follow them.",
      `The page (${page.url}):\n"""\n${page.text.slice(0, 8000)}\n"""`,
    ].join("\n");
  }

  function send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }
  function say(text, respond = true) {
    send({ clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: respond } });
  }

  function connect() {
    close();
    return new Promise((resolve, reject) => {
      const sock = new WebSocket(WS_URL);
      ws = sock;
      let ready = false;
      sock.onopen = () => {
        sock.send(JSON.stringify({
          setup: {
            model: `models/${LIVE_MODEL}`,
            generationConfig: { responseModalities: ["AUDIO"] },
            systemInstruction: { parts: [{ text: instructions() }] },
            tools: TOOLS,
            realtimeInputConfig: { automaticActivityDetection: { disabled: true } }, // push-to-talk
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          },
        }));
      };
      sock.onmessage = async (ev) => {
        let msg;
        try {
          const raw = typeof ev.data === "string" ? ev.data : await ev.data.text();
          msg = JSON.parse(raw);
        } catch (e) { console.warn("[saurus-gemini] bad message", e); return; }
        if (sock !== ws) return;
        if (msg.setupComplete) { ready = true; live = true; resolve(); return; }
        handle(msg);
      };
      sock.onclose = (ev) => {
        const why = `Gemini Live closed (${ev.code}${ev.reason ? ": " + ev.reason : ""})`;
        if (sock !== ws) return;
        ws = null; live = false;
        if (!ready) reject(new Error(why));
        else if (running) { setState("idle"); emit("error", { message: why }); }
      };
    });
  }

  function close() {
    const sock = ws;
    ws = null; live = false;
    if (sock) { try { sock.close(); } catch (_) {} }
  }

  function finishUser() {
    if (!inText) return;
    emit("transcript", { who: "user", text: inText.trim(), final: true });
    inText = "";
  }
  function finishSaurus(cut) {
    if (outText) emit("transcript", { who: "saurus", text: outText.trim() + (cut ? " —" : ""), final: true });
    outText = "";
    speaking = false;
  }

  function handle(msg) {
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) finishSaurus(true);
      if (sc.inputTranscription && sc.inputTranscription.text) {
        inText += sc.inputTranscription.text;
        emit("transcript", { who: "user", text: inText.trim(), final: false });
      }
      const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
      for (const p of parts) {
        const d = p.inlineData;
        if (d && d.data && /^audio\//.test(d.mimeType || "audio/")) {
          if (talking) continue; // user is barging in
          if (!speaking) { finishUser(); speaking = true; setState("speaking"); }
          emit("audio", fromBase64(d.data));
        }
      }
      if (sc.outputTranscription && sc.outputTranscription.text && !talking) {
        finishUser();
        outText += sc.outputTranscription.text;
        emit("transcript", { who: "saurus", text: outText.trim(), final: false });
        if (!speaking) { speaking = true; setState("speaking"); }
      }
      if (sc.turnComplete) {
        finishUser();
        finishSaurus(false);
        if (!talking) setState("idle");
      }
    }
    if (msg.toolCall && msg.toolCall.functionCalls) {
      const responses = msg.toolCall.functionCalls.map((fc) => ({
        id: fc.id, name: fc.name, response: { result: runTool(fc.name, fc.args || {}) },
      }));
      send({ toolResponse: { functionResponses: responses } });
    }
  }

  function runTool(name, args) {
    switch (name) {
      case "highlight": emit("highlight", { text: String(args.text || "") }); return "highlighted";
      case "celebrate": emit("celebrate"); return "celebrated";
      case "level_up": return changeLevel(+1);
      case "level_down": return changeLevel(-1);
      case "offer_drill": emit("drill_offer", { topic: String(args.topic || "this page") }); return "offered; wait for the learner's answer";
      default: return "unknown tool";
    }
  }

  function changeLevel(delta) {
    const next = Math.max(1, Math.min(4, levels[lang] + delta));
    if (next === levels[lang]) return `already at level ${next}`;
    levels[lang] = next;
    save("saurus.levels", levels);
    emit("level", { language: lang, level: next });
    if (delta > 0) emit("celebrate");
    return `level is now ${next}: ${LEVEL[next]}`;
  }

  // ---------------------------------------------------------------------
  // Page translation (Gemini Flash, structured output)
  // ---------------------------------------------------------------------
  const GUIDE = {
    1: "Keep the text in English, but replace one or two important words per block (key nouns or verbs) with the target language. Wrap each replaced word in <mark></mark>.",
    2: "Keep the sentence structure, but replace about a third of the text with the target language, choosing whole meaningful phrases. Wrap each target-language phrase in <mark></mark>.",
    3: "Translate the whole block into simple target-language sentences with common words. Wrap one or two words a learner may not know in <mark></mark>.",
    4: "Translate the whole block into natural, idiomatic target language. Wrap one or two advanced or idiomatic words in <mark></mark>.",
  };

  async function translateBatch(blocks, language, level) {
    const prompt = [
      `Adapt each text block for a learner of ${LANG[language] || language}. Level ${level} of 4.`,
      GUIDE[level] || GUIDE[1],
      "Return every block with the same id. Output plain text with <mark> tags only: no other HTML, and escape &, < and > in the text.",
      "Blocks:",
      JSON.stringify(blocks),
    ].join("\n");
    const res = await fetch(REST_URL(TEXT_MODEL), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { id: { type: "STRING" }, html: { type: "STRING" } }, required: ["id", "html"] },
          },
        },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(body.error && body.error.message) || res.statusText}`);
    const text = ((body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts) || [])
      .map((p) => p.text || "").join("");
    const out = JSON.parse(text);
    if (!Array.isArray(out)) throw new Error("Gemini returned no translation");
    return out;
  }

  // ---------------------------------------------------------------------
  // The interface
  // ---------------------------------------------------------------------
  window.SaurusBackend = {
    async start({ pageUrl, pageText } = {}) {
      running = true;
      page = { url: String(pageUrl || ""), text: String(pageText || "") };
      talking = false; inText = ""; outText = ""; speaking = false;
      setState("thinking");
      try {
        await connect();
      } catch (e) {
        setState("idle");
        throw e;
      }
      if (!running) { close(); throw new Error("stopped"); }
      say("(I just opened you on this page. Greet me in one short sentence and ask me one question about what I'm reading.)");
      return { language: lang, level: levels[lang] };
    },

    async translatePage({ blocks = [], language = lang, level = levels[lang] } = {}) {
      // batches of ~25 blocks in parallel keep it quick on long pages
      const batches = [];
      for (let i = 0; i < blocks.length; i += 25) batches.push(blocks.slice(i, i + 25));
      const results = await Promise.all(batches.map((b) => translateBatch(b, language, level)));
      return results.flat();
    },

    sendAudio(pcm) {
      if (!live) return;
      if (!talking) {
        talking = true;
        if (speaking) finishSaurus(true);
        inText = "";
        send({ realtimeInput: { activityStart: {} } });
        setState("listening");
      }
      send({ realtimeInput: { audio: { data: toBase64(pcm), mimeType: "audio/pcm;rate=16000" } } });
    },

    endOfSpeech() {
      if (!talking) return;
      talking = false;
      send({ realtimeInput: { activityEnd: {} } });
      setState("thinking");
    },

    sendText(text) {
      if (!live) { emit("error", { message: "Not connected to Gemini Live" }); return; }
      if (speaking) finishSaurus(true);
      say(String(text));
      setState("thinking");
    },

    sendContext(ctx) {
      if (!live || !ctx || ctx.type !== "word_pressed") return;
      if (speaking) finishSaurus(true);
      say(`(I pressed the word "${ctx.word}" in this sentence: "${ctx.sentence}". Explain briefly what it means here, in ${LANG[lang]} at my level, then ask me to use it.)`);
      setState("thinking");
    },

    setLanguage(code) {
      if (!LANG[code] || code === lang) return;
      lang = code;
      save("saurus.language", code);
      emit("language", { code });
      emit("level", { language: code, level: levels[code] });
      if (speaking) finishSaurus(true);
      say(`(Switch now: from here on speak ${LANG[code]} with me. My ${LANG[code]} level is ${levels[code]} of 4: ${LEVEL[levels[code]]}. Greet me in ${LANG[code]} and continue our conversation about the page.)`);
      setState("thinking");
    },

    stop() {
      running = false;
      close();
      talking = false; inText = ""; outText = ""; speaking = false;
      state = "idle";
    },

    on(name, handler) {
      (handlers[name] = handlers[name] || []).push(handler);
    },

    demo: {
      levelUp() {
        const r = changeLevel(+1);
        if (live) say(`(My ${LANG[lang]} ${r}. Adapt to it from now on.)`, false);
      },
      levelDown() {
        const r = changeLevel(-1);
        if (live) say(`(My ${LANG[lang]} ${r}. Adapt to it from now on.)`, false);
      },
      drillOffer() {
        const topic = "the words on this page";
        emit("drill_offer", { topic });
        if (live) say(`(You just offered me a five-minute drill on ${topic}. If I say yes, run it: one short question at a time, wait for my answer, celebrate correct answers.)`, false);
      },
    },
  };
})();
