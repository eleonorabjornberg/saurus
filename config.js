/*
 * Saurus configuration. This file is public: NEVER commit an API key.
 *
 * Gemini and Supabase secrets belong in the local Fastify server's .env,
 * never in this public extension configuration. apiBase remains available
 * for a server-side Gemini Live WebSocket proxy.
 *
 * No key and no apiBase: Saurus runs on the offline mock (backend-mock.js).
 */
window.SAURUS_CONFIG = {
  geminiApiKey: "",
  backendApiBase: "http://127.0.0.1:3000",
  enableFastifyPractice: false,      // opt in; Supabase/Gemini remains the primary adaptive tutor
  apiBase: "",                    // e.g. "https://<project>.supabase.co/functions/v1/gemini"
  liveModel: "gemini-3.8-live",   // voice (Gemini Live)
  textModel: "gemini-3.8-flash",  // page translation
  language: "es",                 // selectable demo start: "fr", "de", "es" (A1), or "sv"
};
