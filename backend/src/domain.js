export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function updatedVocabulary(existing, evaluation, { learnerId, word }) {
  const correct = Number(existing?.correct_recalls ?? 0) + (evaluation.correct ? 1 : 0);
  const incorrect = Number(existing?.incorrect_recalls ?? 0) + (evaluation.correct ? 0 : 1);
  const currentMastery = Number(existing?.mastery_score ?? 0);
  return {
    learner_id: learnerId,
    word: existing?.word ?? word,
    translation: existing?.translation || evaluation.expectedTranslation,
    correct_recalls: correct,
    incorrect_recalls: incorrect,
    mastery_score: clamp(currentMastery + (evaluation.correct ? 15 : -10), 0, 100),
  };
}

export function classifyProgress(words) {
  const learnedWords = words.filter((word) => Number(word.mastery_score) >= 70 && Number(word.correct_recalls) > Number(word.incorrect_recalls));
  const strugglingWords = words.filter((word) => Number(word.incorrect_recalls) > 0 && (Number(word.mastery_score) < 70 || Number(word.incorrect_recalls) >= Number(word.correct_recalls)));
  const learnedCount = learnedWords.length;
  const avatarStage = learnedCount >= 20 ? "elder" : learnedCount >= 10 ? "adult" : learnedCount >= 3 ? "juvenile" : "hatchling";
  return { learnedWords, strugglingWords, avatarStage };
}

export function recommendNextAction(words) {
  const { strugglingWords } = classifyProgress(words);
  if (strugglingWords.length) {
    const word = [...strugglingWords].sort((a, b) =>
      (Number(b.incorrect_recalls) - Number(b.correct_recalls)) - (Number(a.incorrect_recalls) - Number(a.correct_recalls)) ||
      Number(a.mastery_score) - Number(b.mastery_score)
    )[0];
    return { type: "recall", word: word.word, prompt: `What does “${word.word}” mean?` };
  }
  return { type: "reading", prompt: "Read a short Spanish article at your current level." };
}
