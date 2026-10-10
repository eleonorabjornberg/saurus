/*
 * Saurus memory in Supabase (hosted, no local server).
 *
 * See AUTH_SETUP.md before deploying migrations. Account memory requires the
 * reviewed 20261010200000_saurus_accounts.sql migration and Supabase Auth.
 * 2. Paste the Project URL and the anon / publishable key below
 *    (Dashboard > Project Settings > API). Both are public by design: the
 *    account memory additionally requires a signed-in user and RLS.
 *    Safe to commit, which makes the setup reproducible for everyone.
 *
 * Private keys must never be placed here.
 */
globalThis.SAURUS_SUPABASE = {
  url: "https://hwsiplosbvlsktxxsmxd.supabase.co",
  anonKey: "sb_publishable_TAps0Sn1VMTxIZAKK3tQVg_t_iBGLcL",
  // The extension uses the deployed Edge Function for Gemini. The private
  // GEMINI_API_KEY remains a Supabase secret and is never sent to the browser.
  gemini: true,
};
