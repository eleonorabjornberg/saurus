/*
 * backend-gemini.js — SaurusBackend on the Gemini API, straight from the browser.
 *
 * Voice: Gemini Live over a WebSocket (16 kHz PCM in, 24 kHz PCM out, built-in
 * transcripts of both sides, tool calls for highlight / level / drill /
 * celebrate). Page translation: Gemini Flash with structured JSON output.
 *
 * Active when config.js sets geminiApiKey (direct to Google) or apiBase (a
 * proxy), or supabase-config.js turns on the "gemini" Supabase Edge Function
 * (key kept in Supabase), and no other backend (backend.js) has set
 * window.SaurusBackend first.
 */
(function () {
  "use strict";
  if (window.SaurusBackend) return;
  const cfg = window.SAURUS_CONFIG || {};
  const sbCfg = window.SAURUS_SUPABASE || {};
  // A local key wins; otherwise the Supabase Edge Function, if switched on.
  const viaSupabase = !cfg.geminiApiKey && !cfg.apiBase && sbCfg.gemini && sbCfg.url;
  if (!cfg.geminiApiKey && !cfg.apiBase && !viaSupabase) return; // nothing configured: the mock runs

  const KEY = encodeURIComponent(cfg.geminiApiKey || "");
  const LIVE_MODEL = cfg.liveModel || "gemini-3.8-live";
  const TEXT_MODEL = cfg.textModel || "gemini-3.8-flash";
  const API = (viaSupabase ? String(sbCfg.url).replace(/\/$/, "") + "/functions/v1/gemini"
    : (cfg.apiBase || "https://generativelanguage.googleapis.com")).replace(/\/$/, "");
  const WS_URL = API.replace(/^http/, "ws") +
    "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=" + KEY;
  const REST_URL = (model) => `${API}/v1beta/models/${model}:generateContent?key=${KEY}`;

  const LANG = { fr: "French", de: "German", es: "Spanish", sv: "Swedish" };
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
  const levels = Object.assign({ fr: 1, de: 1, es: 1, sv: 1 }, load("saurus.levels", {}));
  let lang = LANG[load("saurus.language", "")] ? load("saurus.language", "fr") : (LANG[cfg.language] ? cfg.language : "de");
  const struggles = { fr: [], de: [], es: [], sv: [] }; // [{word, note, misses}], most missed first
  const marked = new Set(); // target-language words the last translations marked on the page
  const nextAction = { fr: null, de: null, es: null, sv: null }; // from saurus_next_action

  // Supabase (hosted, see supabase-config.js): level per language and
  // struggle words, through three database functions (supabase/migrations).
  // Without it, levels stay in this browser only.
  const sb = window.SAURUS_SUPABASE || {};
  const SB_URL = String(sb.url || cfg.supabaseUrl || "").replace(/\/$/, "");
  const SB_KEY = String(sb.anonKey || cfg.supabaseAnonKey || "");
  const LEARNER = String(sb.learner || cfg.learner || "demo").slice(0, 64);
  const memoryOn = !!(SB_URL && SB_KEY);

  async function rpc(fn, args) {
    const headers = { "Content-Type": "application/json", apikey: SB_KEY };
    if (SB_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SB_KEY}`; // legacy anon JWT
    const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(args) });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { msg = JSON.parse(text).message || text; } catch (_) {}
      throw new Error(`Supabase ${res.status}: ${msg}`);
    }
    return text ? JSON.parse(text) : null;
  }
  function memoryProblem(e) {
    console.warn("[saurus-gemini] memory:", e);
    emit("transcript", { who: "saurus", text: `(I can't reach my memory right now: ${e.message}. I'll keep going without it.)`, final: true });
  }
  async function loadMemory(code) {
    if (!memoryOn) return;
    const m = await rpc("saurus_memory", { p_learner: LEARNER, p_language: code });
    if (m && m.level) levels[code] = Math.max(1, Math.min(4, Number(m.level) || 1));
    struggles[code] = Array.isArray(m && m.struggles) ? m.struggles : [];
    nextAction[code] = (m && m.next) || null;
  }
  function saveLevel(code, lv) {
    save("saurus.levels", levels);
    if (memoryOn) rpc("saurus_set_level", { p_learner: LEARNER, p_language: code, p_level: lv }).catch(memoryProblem);
  }
  // Record a right or wrong answer about a word. Supabase replies with what
  // to practise next (saurus_next_action), which goes back to Gemini.
  async function logAnswer(word, correct, note) {
    const w = String(word || "").trim().slice(0, 80);
    if (!w) return "no word given";
    const list = struggles[lang];
    const hit = list.find((x) => x.word.toLowerCase() === w.toLowerCase());
    if (hit) { if (correct) hit.correct = (hit.correct || 0) + 1; else hit.misses++; }
    else if (!correct) list.unshift({ word: w, note: note || null, misses: 1, correct: 0 });
    if (!memoryOn) return "noted";
    try {
      const next = await rpc("saurus_log_answer", {
        p_learner: LEARNER, p_language: lang, p_word: w, p_correct: !!correct,
        p_note: note ? String(note).slice(0, 200) : null,
      });
      nextAction[lang] = next;
      return `saved. ${describeNext(next)}`;
    } catch (e) {
      memoryProblem(e);
      return "noted (memory offline)";
    }
  }
  function describeNext(next) {
    if (!next) return "";
    const tally = `${next.learned || 0} words learned, ${next.struggling || 0} still being learned.`;
    return next.type === "recall"
      ? `Next, check whether they know "${next.word}"${next.note ? ` (${next.note})` : ""}. ${tally}`
      : `Nothing left to recall: continue with the page. ${tally}`;
  }
  function struggleNote(code) {
    const list = struggles[code].slice(0, 8);
    if (!list.length) return "";
    return "Words this learner got wrong or looked up before (most missed first): " +
      list.map((x) => `${x.word}${x.note ? ` (${x.note})` : ""}${x.misses > 1 ? ` ×${x.misses}` : ""}`).join("; ") +
      ". Early on, bring one of them back naturally and check they know it now; highlight it if it is on the page." +
      (nextAction[code] ? ` Practice plan from memory: ${describeNext(nextAction[code])}` : "");
  }

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
      { name: "log_struggle", description: "Remember a word or form the learner got wrong or did not know, so it can be practised in later sessions. Call it every time that happens.",
        parameters: { type: "OBJECT", properties: { word: { type: "STRING", description: "The target-language word or short phrase" }, note: { type: "STRING", description: "What went wrong, in a few words" } }, required: ["word"] } },
      { name: "log_answer", description: "After you check whether the learner knows a word (a recall question, a drill question), report whether they got it right. The result tells you what to practise next: follow it.",
        parameters: { type: "OBJECT", properties: { word: { type: "STRING", description: "The target-language word you checked" }, correct: { type: "BOOLEAN", description: "Did they get it right?" }, note: { type: "STRING", description: "What went wrong, if anything" } }, required: ["word", "correct"] } },
      { name: "offer_drill", description: "Offer a short five-minute drill when the learner keeps making the same kind of mistake.",
        parameters: { type: "OBJECT", properties: { topic: { type: "STRING", description: "What the drill practices, in a few words" } }, required: ["topic"] } },
    ],
  }];

  let page = { url: "", text: "" };
  let lastTranslated = null;
  let recall = null; // {word, until}: a remembered word to highlight once the page is translated
  let ws = null, live = false, running = false;
  let talking = false, inText = "", outText = "", speaking = false;
  const history = []; // last exchanges, to carry the conversation over a reconnect
  let reconnects = 0;
  function remember(who, text) {
    if (!text) return;
    history.push(`${who}: ${text}`);
    if (history.length > 12) history.shift();
  }

  let resuming = false;
  function instructions() {
    return [
      `You are Saurus, a small, warm, patient dinosaur who tutors languages. The learner is learning ${LANG[lang]}.`,
      `Their ${LANG[lang]} level is ${levels[lang]} of 4: ${LEVEL[levels[lang]]}. Speak ${LANG[lang]} at exactly that level.`,
      "Talk about the substance of the page they are reading (the argument, what was decided, what they think), never textbook filler.",
      "Keep each turn short: one to three sentences, usually ending with one question. Correct mistakes gently by repeating the correct form.",
      "Use your tools silently while you talk: highlight words on the page you discuss or the learner struggles with; log_struggle whenever they get a word wrong or don't know it; log_answer after every recall or drill question, then follow the plan it returns; celebrate correct answers; level_up or level_down when their level clearly changes; offer_drill when the same mistake repeats.",
      struggleNote(lang),
      "If the learner switches language or asks for easier/harder, follow them.",
      `The page (${page.url}):\n"""\n${page.text.slice(0, 8000)}\n"""`,
      resuming && history.length
        ? `The connection just dropped and came back. Conversation so far (continue it; do not greet again):\n${history.join("\n")}`
        : "",
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
        else if (running) reconnect(why);
      };
    });
  }

  // Sessions can end on their own (e.g. Supabase's Edge Function time limit,
  // or Gemini's session limit): reconnect quietly and carry on.
  function reconnect(why) {
    if (reconnects >= 3) { setState("idle"); emit("error", { message: why }); return; }
    reconnects++;
    finishUser(); finishSaurus(true);
    talking = false;
    setState("thinking");
    setTimeout(() => {
      if (!running) return;
      resuming = true;
      connect().then(() => {
        resuming = false;
        setTimeout(() => { reconnects = 0; }, 20000);
        setState("idle");
      }, (e) => { resuming = false; if (running) reconnect(e.message); });
    }, 300 * reconnects);
  }

  function close() {
    const sock = ws;
    ws = null; live = false;
    if (sock) { try { sock.close(); } catch (_) {} }
  }

  function finishUser() {
    if (!inText) return;
    emit("transcript", { who: "user", text: inText.trim(), final: true });
    remember("Learner", inText.trim());
    inText = "";
  }
  function finishSaurus(cut) {
    if (outText) emit("transcript", { who: "saurus", text: outText.trim() + (cut ? " —" : ""), final: true });
    remember("Saurus", outText.trim());
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
      const sock = ws;
      Promise.all(msg.toolCall.functionCalls.map(async (fc) => ({
        id: fc.id, name: fc.name, response: { result: await runTool(fc.name, fc.args || {}) },
      }))).then((responses) => { if (ws === sock) send({ toolResponse: { functionResponses: responses } }); });
    }
  }

  async function runTool(name, args) {
    switch (name) {
      case "highlight": emit("highlight", { text: String(args.text || "") }); return "highlighted";
      case "celebrate": emit("celebrate"); return "celebrated";
      case "level_up": return changeLevel(+1);
      case "level_down": return changeLevel(-1);
      case "log_struggle": return logAnswer(args.word, false, args.note);
      case "log_answer": return logAnswer(args.word, !!args.correct, args.note);
      case "offer_drill": emit("drill_offer", { topic: String(args.topic || "this page") }); return "offered; wait for the learner's answer";
      default: return "unknown tool";
    }
  }

  function changeLevel(delta) {
    const next = Math.max(1, Math.min(4, levels[lang] + delta));
    if (next === levels[lang]) return `already at level ${next}`;
    levels[lang] = next;
    saveLevel(lang, next);
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
    for (const item of out) {
      for (const m of String((item && item.html) || "").matchAll(/<mark>([^<]+)<\/mark>/gi)) {
        for (const w of m[1].split(/[^\p{L}\p{M}'’-]+/u)) if (w) marked.add(w.toLowerCase());
      }
    }
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
      history.length = 0; reconnects = 0;
      setState("thinking");
      try {
        await loadMemory(lang); // before connecting, so the session knows level and struggles
      } catch (e) {
        memoryProblem(e);
      }
      try {
        await connect();
      } catch (e) {
        setState("idle");
        throw e;
      }
      if (!running) { close(); throw new Error("stopped"); }
      const nx = nextAction[lang];
      const old = nx && nx.type === "recall" ? { word: nx.word } : struggles[lang][0];
      say(old
        ? `(I just opened you on this page. Greet me in one short sentence, then remind me of "${old.word}", which I got wrong last time, and check I know it now, ideally using the page.)`
        : "(I just opened you on this page. Greet me in one short sentence and ask me one question about what I'm reading.)");
      // highlight it as translated text arrives (it only shows if it is on the page)
      recall = old ? { word: old.word, until: Date.now() + 20000 } : null;
      return { language: lang, level: levels[lang] };
    },

    async translatePage({ blocks = [], language = lang, level = levels[lang] } = {}) {
      if (language !== lastTranslated) { marked.clear(); lastTranslated = language; }
      const done = async () => {
        if (recall && Date.now() < recall.until && language === lang) emit("highlight", { text: recall.word });
      };
      // batches of ~25 blocks in parallel keep it quick on long pages
      const batches = [];
      for (let i = 0; i < blocks.length; i += 25) batches.push(blocks.slice(i, i + 25));
      const results = await Promise.all(batches.map((b) => translateBatch(b, language, level)));
      setTimeout(done, 0); // after Saurus has put this batch on the page
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
      remember("Learner", String(text));
      say(String(text));
      setState("thinking");
    },

    sendContext(ctx) {
      if (!live || !ctx || ctx.type !== "word_pressed") return;
      if (speaking) finishSaurus(true);
      if (marked.has(String(ctx.word).toLowerCase())) logAnswer(ctx.word, false, "looked up"); // only target-language words
      say(`(I pressed the word "${ctx.word}" in this sentence: "${ctx.sentence}". Explain briefly what it means here, in ${LANG[lang]} at my level, then ask me to use it.)`);
      setState("thinking");
    },

    async setLanguage(code) {
      if (!LANG[code] || code === lang) return;
      lang = code;
      recall = null;
      save("saurus.language", code);
      emit("language", { code });
      if (speaking) finishSaurus(true);
      setState("thinking");
      try { await loadMemory(code); } catch (e) { memoryProblem(e); }
      if (lang !== code) return; // switched again meanwhile
      emit("level", { language: code, level: levels[code] });
      const note = struggleNote(code);
      say(`(Switch now: from here on speak ${LANG[code]} with me. My ${LANG[code]} level is ${levels[code]} of 4: ${LEVEL[levels[code]]}.${note ? " " + note : ""} Greet me in ${LANG[code]} and continue our conversation about the page.)`);
    },

    stop() {
      running = false;
      recall = null;
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
        const due = struggles[lang].slice(0, 3).map((x) => x.word);
        const topic = due.length ? due.join(", ") : "the words on this page";
        emit("drill_offer", { topic });
        if (live) say(`(You just offered me a five-minute drill on ${topic}. If I say yes, run it: one short question at a time, wait for my answer, celebrate correct answers.)`, false);
      },
    },
  };
})();
