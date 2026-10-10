const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "backend.js"), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function loadFacade({ language = "es", level = 1, reply, offline = false, practice = false } = {}) {
  const calls = [];
  const handlers = {};
  const voice = {
    on(name, fn) { (handlers[name] ||= []).push(fn); },
    async start() { calls.push(["start"]); return { language, level }; },
    translatePage(options) { calls.push(["translate", options]); return Promise.resolve([{ id: "b1", html: "voice translation" }]); },
    sendText(text) { calls.push(["text", text]); },
    sendContext(value) { calls.push(["context", value]); },
    setLanguage(code) { calls.push(["language", code]); handlers.language?.forEach((fn) => fn({ code })); },
    sendAudio() { calls.push(["audio"]); },
    stop() { calls.push(["stop"]); },
    demo: {
      levelUp() { calls.push(["levelUp"]); },
      levelDown() { calls.push(["levelDown"]); },
    },
  };
  const requests = [];
  const responses = {
    learner: { id: "11111111-1111-4111-8111-111111111111", target_language: "Spanish", cefr_level: "A1" },
    nextAction: { type: "recall", word: "aunque", prompt: "What does “aunque” mean?" },
    recall: { evaluation: { correct: true, feedback: "Correcto" }, vocabulary: { word: "aunque", correct_recalls: 1 } },
    ...reply,
  };
  const quietConsole = { info() {}, error() {}, warn() {}, log() {} };
  const context = {
    AbortController, clearTimeout, setTimeout, console: quietConsole,
    window: { SaurusBackend: voice, SAURUS_CONFIG: { enableFastifyPractice: practice } },
    chrome: { runtime: {
      id: "extension-id", lastError: null,
      sendMessage(message, callback) {
        requests.push(message);
        queueMicrotask(() => callback(offline ? { ok: false, error: "offline" } : { ok: true, data: responses[message.type] }));
      },
    } },
  };
  vm.runInNewContext(source, context);
  return { facade: context.window.SaurusBackend, voice, handlers, calls, requests };
}

test("preserves all four voice languages without forcing Spanish", async () => {
  for (const language of ["fr", "de", "es", "sv"]) {
    const { facade } = loadFacade({ language, level: 2 });
    const info = await facade.start({ pageText: "article" });
    assert.deepEqual({ ...info }, { language, level: 2 });
    facade.stop();
  }
});

test("manual level controls and four age levels remain owned by voice backend", async () => {
  const { facade, calls, handlers } = loadFacade({ language: "de", level: 3 });
  const levels = [];
  facade.on("level", (value) => levels.push(value));
  await facade.start();
  facade.demo.levelUp();
  facade.demo.levelDown();
  handlers.level.forEach((fn) => fn({ language: "de", level: 4 }));
  assert.deepEqual(calls.filter(([name]) => name === "levelUp" || name === "levelDown"), [["levelUp"], ["levelDown"]]);
  assert.deepEqual({ ...levels[0] }, { language: "de", level: 4 });
});

test("keeps voice translation and does not make a duplicate Fastify adaptation call", async () => {
  const { facade, calls, requests } = loadFacade({ language: "es" });
  await facade.start();
  const options = { blocks: [{ id: "b1", text: "A house" }], language: "es", level: 1 };
  assert.deepEqual(await facade.translatePage(options), [{ id: "b1", html: "voice translation" }]);
  assert.equal(calls.filter(([name]) => name === "translate").length, 1);
  assert.equal(requests.some(({ type }) => type === "adapt"), false);
});

test("localhost outage does not block voice startup, translation, or controls", async () => {
  const { facade, calls } = loadFacade({ language: "sv", offline: true });
  assert.deepEqual({ ...(await facade.start()) }, { language: "sv", level: 1 });
  await tick();
  assert.deepEqual(await facade.translatePage({ blocks: [] }), [{ id: "b1", html: "voice translation" }]);
  facade.setLanguage("fr");
  facade.demo.levelUp();
  assert.equal(calls.some(([name, code]) => name === "language" && code === "fr"), true);
  assert.equal(calls.some(([name]) => name === "levelUp"), true);
});

test("Spanish recommendation uses one recall call and leaves persistence to Fastify", async () => {
  const { facade, requests } = loadFacade({ language: "es", practice: true });
  const transcripts = [];
  facade.on("transcript", (value) => transcripts.push(value));
  await facade.start();
  await tick(); await tick();
  assert.equal(requests.filter(({ type }) => type === "nextAction").length, 1);
  assert.match(transcripts[0].text, /Optional practice/);
  await facade.sendText("although");
  const recalls = requests.filter(({ type }) => type === "recall");
  assert.equal(recalls.length, 1);
  assert.deepEqual({ ...recalls[0].body }, {
    learnerId: "11111111-1111-4111-8111-111111111111", word: "aunque", answer: "although",
  });
});

test("Fastify practice is opt-in and does not duplicate Supabase adaptive practice", async () => {
  const { facade, requests, calls } = loadFacade({ language: "es" });
  await facade.start();
  await tick();
  assert.equal(requests.length, 0);
  facade.sendContext({ type: "word_pressed", word: "aunque", sentence: "Aunque llueve." });
  assert.deepEqual(calls.at(-1), ["context", { type: "word_pressed", word: "aunque", sentence: "Aunque llueve." }]);
});

test("non-Spanish sessions do not request recommendations for the Spanish demo learner", async () => {
  const { facade, requests } = loadFacade({ language: "fr" });
  await facade.start();
  await tick(); await tick();
  assert.equal(requests.some(({ type }) => type === "nextAction"), false);
});
