import Fastify from "fastify";
import cors from "@fastify/cors";
import { ZodError } from "zod";
import { AdaptRequestSchema, RecallRequestSchema } from "./schemas.js";
import { classifyProgress, recommendNextAction, updatedVocabulary } from "./domain.js";

function isLoopback(address = "") {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

export async function buildApp({ store, gemini, allowedOrigins = [], logger = false }) {
  const app = Fastify({ logger, bodyLimit: 16_384, trustProxy: false });
  await app.register(cors, {
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin));
    },
    methods: ["GET", "POST"],
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) return reply.code(400).send({ error: "Invalid request", details: error.issues });
    app.log.error(error);
    return reply.code(error.statusCode ?? 500).send({ error: error.statusCode ? error.message : "Internal server error" });
  });

  async function learnerOr404(reply) {
    const learner = await store.getDemoLearner();
    if (!learner) reply.code(404).send({ error: "Demo learner not found. Create a Spanish learner profile first." });
    return learner;
  }
  async function localOnly(request, reply) {
    if (!isLoopback(request.ip)) return reply.code(403).send({ error: "Demo mutation endpoints are localhost-only" });
  }

  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/learner", async (_request, reply) => learnerOr404(reply));

  app.post("/api/reading/adapt", { preHandler: localOnly }, async (request, reply) => {
    const input = AdaptRequestSchema.parse(request.body);
    const learner = await learnerOr404(reply);
    if (!learner) return;
    const vocabulary = await store.getVocabulary(learner.id);
    const struggles = classifyProgress(vocabulary).strugglingWords.slice(0, 20).map(({ word, translation, mastery_score, incorrect_recalls, correct_recalls }) => ({ word, translation, mastery_score, incorrect_recalls, correct_recalls }));
    if ("blocks" in input) return gemini.adaptBlocks({ blocks: input.blocks, learner, struggles });
    return gemini.adaptArticle({ articleText: input.articleText, learner, struggles });
  });

  app.post("/api/vocabulary/recall", { preHandler: localOnly }, async (request, reply) => {
    const input = RecallRequestSchema.parse(request.body);
    const learner = await learnerOr404(reply);
    if (!learner) return;
    if (input.learnerId !== learner.id) return reply.code(403).send({ error: "Only the fixed demo learner is available" });
    const existing = await store.getVocabularyWord(learner.id, input.word);
    const evaluation = await gemini.evaluateRecall({ word: input.word, answer: input.answer, storedTranslation: existing?.translation });
    const record = updatedVocabulary(existing, evaluation, input);
    const vocabulary = await store.saveVocabulary(record, existing?.id);
    return { evaluation: { correct: evaluation.correct, feedback: evaluation.feedback, expectedTranslation: evaluation.expectedTranslation }, vocabulary };
  });

  app.get("/api/vocabulary/struggles", async (_request, reply) => {
    const learner = await learnerOr404(reply);
    if (!learner) return;
    const words = await store.getVocabulary(learner.id);
    return { words: classifyProgress(words).strugglingWords };
  });

  app.get("/api/learning/next-action", async (_request, reply) => {
    const learner = await learnerOr404(reply);
    if (!learner) return;
    return recommendNextAction(await store.getVocabulary(learner.id));
  });

  app.get("/api/learning/progress", async (_request, reply) => {
    const learner = await learnerOr404(reply);
    if (!learner) return;
    const { learnedWords, strugglingWords, avatarStage } = classifyProgress(await store.getVocabulary(learner.id));
    return { learnedWords, strugglingWords, avatarStage };
  });
  return app;
}
