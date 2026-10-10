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
  learner: "demo",  // whose memory to use (one shared demo learner)
};
