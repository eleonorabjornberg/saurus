/*
 * Saurus configuration. This file is public: NEVER commit an API key.
 *
 * Local demo with your own key: paste it below, then run once
 *   git update-index --skip-worktree config.js
 * so git ignores your local edit and it can't be pushed.
 *
 * Production: keep the key in Supabase. Point apiBase at an Edge Function
 * that forwards requests to Google with the key added server-side, and
 * leave geminiApiKey empty.
 *
 * No key and no apiBase: Saurus runs on the offline mock (backend-mock.js).
 */
window.SAURUS_CONFIG = {
  geminiApiKey: "",
  apiBase: "",                    // e.g. "https://<project>.supabase.co/functions/v1/gemini"
  liveModel: "gemini-3.8-live",   // voice (Gemini Live)
  textModel: "gemini-3.8-flash",  // page translation
  language: "de",                 // starting language: "de", "fr", "es" or "sv"
};
