import { createClient } from "@supabase/supabase-js";

const learnerFields = "id, target_language, cefr_level, created_at";
const vocabularyFields = "id, learner_id, word, translation, mastery_score, incorrect_recalls, correct_recalls, created_at";

function unwrap(result, context) {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
}

export function createStore({ url, key }) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return {
    async getDemoLearner() {
      const result = await client.from("learner_profiles").select(learnerFields).eq("target_language", "Spanish").order("created_at", { ascending: true }).limit(1).maybeSingle();
      return unwrap(result, "Could not load demo learner");
    },
    async getVocabulary(learnerId) {
      const result = await client.from("vocabulary").select(vocabularyFields).eq("learner_id", learnerId);
      return unwrap(result, "Could not load vocabulary") ?? [];
    },
    async getVocabularyWord(learnerId, word) {
      const result = await client.from("vocabulary").select(vocabularyFields).eq("learner_id", learnerId).ilike("word", word).limit(1).maybeSingle();
      return unwrap(result, "Could not load vocabulary word");
    },
    async saveVocabulary(record, existingId) {
      const query = existingId
        ? client.from("vocabulary").update(record).eq("id", existingId)
        : client.from("vocabulary").insert(record);
      const result = await query.select(vocabularyFields).single();
      return unwrap(result, "Could not save vocabulary");
    },
  };
}
