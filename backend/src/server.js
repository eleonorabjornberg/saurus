import "dotenv/config";
import { loadConfig } from "./config.js";
import { buildApp } from "./app.js";
import { createGeminiService } from "./services/gemini.js";
import { createStore } from "./services/store.js";

const config = loadConfig();
const app = await buildApp({
  store: createStore({ url: config.SUPABASE_URL, key: config.SUPABASE_SECRET_KEY }),
  gemini: createGeminiService({ apiKey: config.GEMINI_API_KEY, model: config.GEMINI_MODEL }),
  allowedOrigins: config.allowedOrigins,
  logger: true,
});

await app.listen({ host: config.HOST, port: config.PORT });
