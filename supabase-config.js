/*
 * Saurus memory in Supabase (hosted, no local server).
 *
 * 1. Run supabase/migrations/20261010160000_saurus_memory.sql once in your
 *    project (Dashboard > SQL Editor > Run).
 * 2. Paste the Project URL and the anon / publishable key below
 *    (Dashboard > Project Settings > API). Both are public by design: the
 *    key can only call Saurus's three memory functions, not read tables.
 *    Safe to commit, which makes the setup reproducible for everyone.
 *
 * Left empty, Saurus remembers levels in this browser only.
 */
window.SAURUS_SUPABASE = {
  url: "https://hwsiplosbvlsktxxsmxd.supabase.co",
  anonKey: "sb_publishable_TAps0Sn1VMTxIZAKK3tQVg_t_iBGLcL",
  learner: "auto",  // "auto": each install gets its own memory; or a fixed name like "demo" to share one
  // true once the "gemini" Edge Function is deployed with the GEMINI_API_KEY
  // secret: Saurus then uses Gemini through Supabase and needs no local key.
  // (A key in config.js still takes priority.)
  gemini: false,
};
