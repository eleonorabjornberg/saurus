/* Optional Fastify learning layer. Voice, translation, language and level stay authoritative below. */
(function () {
  "use strict";
  const voice = window.SaurusBackend || null;
  const cfg = window.SAURUS_CONFIG || {};
  // Legacy optional Fastify uses a fixed demo learner. Never send authenticated
  // account activity there until that separate server has JWT-aware routes.
  const practiceEnabled = cfg.enableFastifyPractice === true && !window.SaurusAccount;
  const handlers = {};
  const LANGUAGE_CODE = { French: "fr", German: "de", Spanish: "es", Swedish: "sv" };
  const API_TIMEOUT_MS = 1500;
  let learner = null, pendingRecall = null, running = false, session = 0;
  let currentLanguage = null, currentLevel = 1;

  function emit(name, data) {
    for (const handler of handlers[name] || []) try { handler(data); } catch (error) { console.error("[saurus-api] event handler", error); }
  }
  function withTimeout(promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Local Saurus API unavailable")), API_TIMEOUT_MS);
      promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
    });
  }
  function api(type, body) {
    if (typeof chrome !== "undefined" && chrome.runtime?.id && chrome.runtime.sendMessage) {
      return withTimeout(new Promise((resolve, reject) => chrome.runtime.sendMessage({ channel: "saurus-api", type, body }, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) return reject(new Error(lastError.message));
        if (!response?.ok) return reject(new Error(response?.error || "Local Saurus API unavailable"));
        resolve(response.data);
      })));
    }
    const paths = { learner: "/api/learner", recall: "/api/vocabulary/recall", progress: "/api/learning/progress", nextAction: "/api/learning/next-action" };
    if (!paths[type]) return Promise.reject(new Error("Unsupported Saurus API operation"));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    return fetch((cfg.backendApiBase || "http://127.0.0.1:3000").replace(/\/$/, "") + paths[type], {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Saurus API returned ${response.status}`);
      return payload;
    }).finally(() => clearTimeout(timer));
  }
  function learnerLanguage() { return learner && LANGUAGE_CODE[learner.target_language]; }
  async function loadRecommendation(forSession) {
    try {
      learner = await api("learner");
      if (!running || session !== forSession || currentLanguage !== learnerLanguage()) return;
      const action = await api("nextAction");
      if (!running || session !== forSession || currentLanguage !== learnerLanguage()) return;
      if (action.type === "recall" && action.word) {
        pendingRecall = action.word;
        emit("transcript", { who: "saurus", text: `Optional practice — type your answer: ${action.prompt}`, final: true });
        emit("highlight", { text: action.word });
      }
    } catch (error) {
      console.info("[saurus-api] optional learning service unavailable", error?.message || String(error));
    }
  }
  async function evaluate(answer) {
    const word = pendingRecall;
    if (!word || !learner || currentLanguage !== learnerLanguage()) return false;
    pendingRecall = null;
    emit("state", "thinking");
    try {
      const result = await api("recall", { learnerId: learner.id, word, answer: String(answer) });
      emit("transcript", { who: "saurus", text: result.evaluation.feedback, final: true });
      if (result.evaluation.correct) emit("celebrate");
    } catch (error) {
      console.info("[saurus-api] recall service unavailable", error?.message || String(error));
      emit("transcript", { who: "saurus", text: "Adaptive practice is temporarily unavailable; your conversation can continue.", final: true });
    } finally { emit("state", "idle"); }
    return true;
  }
  if (voice?.on) {
    for (const name of ["state", "audio", "highlight", "drill_offer", "celebrate", "error", "transcript"]) voice.on(name, (data) => emit(name, data));
    voice.on("language", (data) => {
      currentLanguage = data?.code || currentLanguage;
      pendingRecall = null;
      emit("language", data);
      if (running && practiceEnabled) loadRecommendation(session);
    });
    voice.on("level", (data) => {
      if (data?.language === currentLanguage) currentLevel = Number(data.level) || currentLevel;
      emit("level", data);
    });
  }
  window.SaurusBackend = {
    async start(context = {}) {
      running = true;
      const activeSession = ++session;
      if (window.SaurusAccount) {
        const state = await window.SaurusAccount.request("status");
        if (!state.user || !state.profile?.onboarded) throw new Error("Open Saurus from the toolbar to finish signing in.");
        await voice?.restoreAccount?.(state.profile);
      }
      if (!running || session !== activeSession) throw new Error("stopped");
      const info = voice?.start ? await voice.start(context) : { language: cfg.language || "es", level: 1 };
      if (!running || session !== activeSession) throw new Error("stopped");
      currentLanguage = info?.language || currentLanguage || cfg.language || "es";
      currentLevel = Number(info?.level) || currentLevel;
      if (practiceEnabled) loadRecommendation(activeSession);
      return { language: currentLanguage, level: currentLevel };
    },
    translatePage(options) { return voice?.translatePage ? voice.translatePage(options) : Promise.resolve([]); },
    sendAudio(pcm) { return voice?.sendAudio?.(pcm); },
    endOfSpeech() { return voice?.endOfSpeech?.(); },
    sendText(text) { if (pendingRecall) return evaluate(text); return voice?.sendText?.(text); },
    sendContext(context) { return voice?.sendContext?.(context); },
    setLanguage(code) { pendingRecall = null; return voice?.setLanguage?.(code); },
    stop() { running = false; session += 1; pendingRecall = null; learner = null; return voice?.stop?.(); },
    on(name, handler) { (handlers[name] = handlers[name] || []).push(handler); },
    demo: voice?.demo,
  };
})();
