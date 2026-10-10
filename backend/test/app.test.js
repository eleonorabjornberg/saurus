import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";

const learner = { id: "11111111-1111-4111-8111-111111111111", target_language: "Spanish", cefr_level: "A1", created_at: "2026-01-01" };

function fixtures(initialWords = []) {
  const words = structuredClone(initialWords);
  const calls = { adapt: [], evaluate: [], save: [] };
  const store = {
    async getDemoLearner() { return learner; },
    async getVocabulary() { return words; },
    async getVocabularyWord(_id, word) { return words.find((item) => item.word.toLowerCase() === word.toLowerCase()) ?? null; },
    async saveVocabulary(record, existingId) {
      calls.save.push({ record, existingId });
      const saved = { id: existingId ?? "new-id", ...record };
      const index = words.findIndex((item) => item.id === existingId);
      if (index >= 0) words[index] = saved; else words.push(saved);
      return saved;
    },
  };
  const gemini = {
    async adaptArticle(input) {
      calls.adapt.push(input);
      return { adaptedText: "Texto sencillo", vocabularyHighlights: [], comprehensionQuestion: "¿Qué pasó?" };
    },
    async adaptBlocks(input) {
      calls.adapt.push(input);
      return { blocks: input.blocks.map(({ id, text }) => ({ id, html: text })), vocabularyHighlights: [], comprehensionQuestion: "¿Qué pasó?" };
    },
    async evaluateRecall(input) {
      calls.evaluate.push(input);
      const correct = input.answer.toLowerCase() === "although";
      return { correct, feedback: correct ? "Correcto" : "Try again", expectedTranslation: "although" };
    },
  };
  return { store, gemini, calls };
}

test("recall scoring persists server-computed counters and mastery", async (t) => {
  const f = fixtures([{ id: "v1", learner_id: learner.id, word: "aunque", translation: "although", mastery_score: 10, correct_recalls: 0, incorrect_recalls: 1 }]);
  const app = await buildApp(f); t.after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/api/vocabulary/recall", payload: { learnerId: learner.id, word: "aunque", answer: "although" } });
  assert.equal(response.statusCode, 200);
  assert.equal(f.calls.save.length, 1);
  assert.equal(f.calls.save[0].record.correct_recalls, 1);
  assert.equal(f.calls.save[0].record.incorrect_recalls, 1);
  assert.equal(f.calls.save[0].record.mastery_score, 25);
});

test("recall request rejects a client-supplied mastery score", async (t) => {
  const f = fixtures(); const app = await buildApp(f); t.after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/api/vocabulary/recall", payload: { learnerId: learner.id, word: "aunque", answer: "although", mastery_score: 100 } });
  assert.equal(response.statusCode, 400);
  assert.equal(f.calls.save.length, 0);
});

test("adaptation gives stored mistakes to Gemini", async (t) => {
  const f = fixtures([{ id: "v1", word: "aunque", translation: "although", mastery_score: 0, correct_recalls: 0, incorrect_recalls: 1 }]);
  const app = await buildApp(f); t.after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/api/reading/adapt", payload: { articleText: "Aunque llueve, caminamos por el parque esta mañana." } });
  assert.equal(response.statusCode, 200);
  assert.equal(f.calls.adapt[0].struggles[0].word, "aunque");
});

test("block adaptation preserves the extension block contract", async (t) => {
  const f = fixtures(); const app = await buildApp(f); t.after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/api/reading/adapt", payload: { blocks: [{ id: "b1", text: "A sufficiently useful article sentence." }] } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().blocks, [{ id: "b1", html: "A sufficiently useful article sentence." }]);
});

test("next action returns a reading when no words are struggling", async (t) => {
  const f = fixtures([{ word: "casa", mastery_score: 90, correct_recalls: 4, incorrect_recalls: 0 }]);
  const app = await buildApp(f); t.after(() => app.close());
  const response = await app.inject({ method: "GET", url: "/api/learning/next-action" });
  assert.deepEqual(response.json(), { type: "reading", prompt: "Read a short Spanish article at your current level." });
});

test("article size is bounded before Gemini is called", async (t) => {
  const f = fixtures(); const app = await buildApp(f); t.after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/api/reading/adapt", payload: { articleText: "a".repeat(12001) } });
  assert.equal(response.statusCode, 400);
  assert.equal(f.calls.adapt.length, 0);
});

test("mistake memory flows into the next article and a later correct recall updates progress", async (t) => {
  const f = fixtures(); const app = await buildApp(f); t.after(() => app.close());
  const wrong = await app.inject({ method: "POST", url: "/api/vocabulary/recall", payload: { learnerId: learner.id, word: "aunque", answer: "always" } });
  assert.equal(wrong.statusCode, 200);
  assert.equal(wrong.json().vocabulary.incorrect_recalls, 1);

  const adapted = await app.inject({ method: "POST", url: "/api/reading/adapt", payload: { articleText: "Aunque hace frío, hoy caminaremos juntos hasta la biblioteca." } });
  assert.equal(adapted.statusCode, 200);
  assert.equal(f.calls.adapt.at(-1).struggles[0].word, "aunque");

  const correct = await app.inject({ method: "POST", url: "/api/vocabulary/recall", payload: { learnerId: learner.id, word: "aunque", answer: "although" } });
  assert.equal(correct.statusCode, 200);
  assert.equal(correct.json().vocabulary.correct_recalls, 1);
  assert.equal(correct.json().vocabulary.incorrect_recalls, 1);
  assert.equal(correct.json().vocabulary.mastery_score, 15);
});
