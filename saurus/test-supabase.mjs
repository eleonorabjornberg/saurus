import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("learner_profiles")
  .select("id, target_language, cefr_level")
  .limit(5);

if (error) {
  console.error("❌ Supabase connection failed:", error.message);
  process.exit(1);
}

console.log("🦖 Supabase connected successfully!");
console.log("Learner profiles:", data);
