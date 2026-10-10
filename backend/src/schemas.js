import { z } from "zod";

export const AdaptRequestSchema = z.object({
  articleText: z.string().trim().min(20).max(12_000),
}).strict();

export const RecallRequestSchema = z.object({
  learnerId: z.string().uuid(),
  word: z.string().trim().min(1).max(100),
  answer: z.string().trim().min(1).max(500),
}).strict();

export const AdaptResultSchema = z.object({
  adaptedText: z.string().min(1),
  vocabularyHighlights: z.array(z.object({
    word: z.string().min(1),
    translation: z.string().min(1),
    note: z.string().min(1),
  })).max(8),
  comprehensionQuestion: z.string().min(1),
}).strict();

export const RecallEvaluationSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().min(1).max(500),
  expectedTranslation: z.string().min(1).max(200),
}).strict();
