import test from "node:test";
import assert from "node:assert/strict";
import { classifyProgress, recommendNextAction, updatedVocabulary } from "../src/domain.js";

test("correct recall increments correct count and mastery", () => {
  const result = updatedVocabulary({ word: "aunque", translation: "although", correct_recalls: 1, incorrect_recalls: 2, mastery_score: 20 }, { correct: true, expectedTranslation: "although" }, { learnerId: "learner", word: "aunque" });
  assert.deepEqual(result, { learner_id: "learner", word: "aunque", translation: "although", correct_recalls: 2, incorrect_recalls: 2, mastery_score: 35 });
});

test("incorrect recall cannot lower mastery below zero", () => {
  const result = updatedVocabulary(null, { correct: false, expectedTranslation: "although" }, { learnerId: "learner", word: "aunque" });
  assert.equal(result.incorrect_recalls, 1);
  assert.equal(result.correct_recalls, 0);
  assert.equal(result.mastery_score, 0);
});

test("recommendation prioritizes the strongest struggle", () => {
  const action = recommendNextAction([
    { word: "casa", mastery_score: 80, correct_recalls: 5, incorrect_recalls: 1 },
    { word: "aunque", mastery_score: 15, correct_recalls: 1, incorrect_recalls: 4 },
    { word: "todavía", mastery_score: 20, correct_recalls: 1, incorrect_recalls: 2 },
  ]);
  assert.equal(action.type, "recall");
  assert.equal(action.word, "aunque");
});

test("progress derives learned, struggling, and avatar stage from existing columns", () => {
  const words = [
    { word: "uno", mastery_score: 90, correct_recalls: 3, incorrect_recalls: 0 },
    { word: "dos", mastery_score: 80, correct_recalls: 2, incorrect_recalls: 0 },
    { word: "tres", mastery_score: 70, correct_recalls: 2, incorrect_recalls: 1 },
    { word: "aunque", mastery_score: 20, correct_recalls: 0, incorrect_recalls: 2 },
  ];
  const progress = classifyProgress(words);
  assert.equal(progress.learnedWords.length, 3);
  assert.equal(progress.strugglingWords[0].word, "aunque");
  assert.equal(progress.avatarStage, "juvenile");
});
