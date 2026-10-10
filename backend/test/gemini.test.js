import test from "node:test";
import assert from "node:assert/strict";
import { createGeminiService, GeminiStructuredOutputError } from "../src/services/gemini.js";

const validResult = {
  adaptedText: "Texto sencillo.",
  vocabularyHighlights: [{ word: "aunque", translation: "although", note: "Conjunction" }],
  comprehensionQuestion: "¿Qué ocurrió?",
};

function response(text, finishReason = "STOP", usageMetadata = {}) {
  return { text, candidates: [{ finishReason }], usageMetadata };
}

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        return responses.shift();
      },
    },
  };
}

function quietLogger() {
  const entries = { warn: [], error: [] };
  return {
    entries,
    warn(value) { entries.warn.push(value); },
    error(value) { entries.error.push(value); },
  };
}

const adaptationInput = {
  articleText: "Aunque llueve, caminamos juntos hasta la biblioteca.",
  learner: { cefr_level: "A1", target_language: "Spanish" },
  struggles: [],
};

test("accepts valid structured JSON without retrying", async () => {
  const client = fakeClient([response(JSON.stringify(validResult))]);
  const logger = quietLogger();
  const service = createGeminiService({ client, logger });

  assert.deepEqual(await service.adaptArticle(adaptationInput), validResult);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].config.maxOutputTokens, 8192);
  assert.equal(client.calls[0].config.thinkingConfig.thinkingBudget, 2048);
  assert.equal(logger.entries.warn.length, 0);
});

test("retries once when JSON is truncated by the token limit", async () => {
  const client = fakeClient([
    response('{"adaptedText":"Texto sin terminar', "MAX_TOKENS", { candidatesTokenCount: 1100, thoughtsTokenCount: 100 }),
    response(JSON.stringify(validResult)),
  ]);
  const logger = quietLogger();
  const service = createGeminiService({ client, logger });

  assert.deepEqual(await service.adaptArticle(adaptationInput), validResult);
  assert.equal(client.calls.length, 2);
  assert.equal(logger.entries.warn.length, 1);
  assert.deepEqual(logger.entries.warn[0], {
    event: "gemini_structured_output_failure",
    attempt: 1,
    failure: "max_tokens",
    finishReason: "MAX_TOKENS",
    responseLength: 34,
    promptTokenCount: undefined,
    candidateTokenCount: 1100,
    thoughtsTokenCount: 100,
    totalTokenCount: undefined,
  });
});

test("fails cleanly after one retry for malformed responses", async () => {
  const client = fakeClient([
    response('{"adaptedText":'),
    response(""),
  ]);
  const logger = quietLogger();
  const service = createGeminiService({ client, logger });

  await assert.rejects(() => service.adaptArticle(adaptationInput), GeminiStructuredOutputError);
  assert.equal(client.calls.length, 2);
  assert.equal(logger.entries.warn[0].failure, "invalid_json");
  assert.equal(logger.entries.error[0].failure, "empty_response");
  assert.equal("text" in logger.entries.warn[0], false);
});
