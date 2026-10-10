const test = require("node:test");
const assert = require("node:assert/strict");
const { API_BASE, ROUTES, requestBackend } = require("../background.js");

test("service worker exposes only the expected Fastify routes", () => {
  assert.deepEqual(ROUTES, {
    learner: ["GET", "/api/learner"], adapt: ["POST", "/api/reading/adapt"],
    recall: ["POST", "/api/vocabulary/recall"], progress: ["GET", "/api/learning/progress"],
    nextAction: ["GET", "/api/learning/next-action"],
  });
});

test("POST operations serialize JSON to localhost", async () => {
  let seen;
  const result = await requestBackend("recall", { word: "casa" }, async (url, init) => {
    seen = { url, init };
    return { ok: true, async json() { return { saved: true }; } };
  });
  assert.equal(seen.url, API_BASE + "/api/vocabulary/recall");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.body, JSON.stringify({ word: "casa" }));
  assert.deepEqual(result, { saved: true });
});

test("unknown operations and API errors are rejected", async () => {
  await assert.rejects(() => requestBackend("secrets"), /Unsupported/);
  await assert.rejects(() => requestBackend("learner", undefined, async () => ({
    ok: false, status: 503, async json() { return { error: "offline" }; },
  })), /offline/);
});
