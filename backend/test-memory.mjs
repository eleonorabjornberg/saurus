import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

// 1. Find or create a demo learner
let { data: learner, error } = await supabase
  .from("learner_profiles")
  .select("*")
  .eq("target_language", "Spanish")
  .limit(1)
  .maybeSingle();

if (error) throw error;

if (!learner) {
  const result = await supabase
    .from("learner_profiles")
    .insert({
      target_language: "Spanish",
      cefr_level: "A1"
    })
    .select()
    .single();

  if (result.error) throw result.error;
  learner = result.data;
}

console.log("🦖 Learner created:", learner.id);

// 2. Record a vocabulary mistake
const { error: saveError } = await supabase
  .from("vocabulary")
  .upsert({
    learner_id: learner.id,
    word: "aunque",
    translation: "although",
    mastery_score: 10,
    incorrect_recalls: 1,
    correct_recalls: 0
  }, {
    onConflict: "learner_id,word"
  });

if (saveError) throw saveError;

console.log("❌ Learner struggled with: aunque");

// 3. Retrieve the stored memory
const { data: words, error: readError } = await supabase
  .from("vocabulary")
  .select("*")
  .eq("learner_id", learner.id)
  .eq("word", "aunque");

if (readError) throw readError;

console.log("\n🧠 SAURUS MEMORY:");
console.log(words);

// 4. Show how Saurus uses the memory
if (words.length && words[0].incorrect_recalls > 0) {
  console.log(
    "\n🦖 Saurus: You struggled with 'aunque' earlier."
  );
  console.log(
    "Can you remember what it means?"
  );
}
