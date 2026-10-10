import { z } from "zod";

const AdaptBlockSchema = z.object({
  id: z.string().min(1).max(100),
  text: z.string().trim().min(2).max(4_000),
}).strict();

export const AdaptRequestSchema = z.union([
  z.object({ articleText: z.string().trim().min(20).max(12_000) }).strict(),
  z.object({ blocks: z.array(AdaptBlockSchema).min(1).max(100) }).strict()
    .refine(({ blocks }) => blocks.reduce((n, block) => n + block.text.length, 0) <= 12_000, "Blocks exceed 12000 characters"),
]);

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

export const AdaptBlocksResultSchema = z.object({
  blocks: z.array(z.object({
    id: z.string().min(1).max(100),
    html: z.string().min(1),
  }).strict()),
  vocabularyHighlights: z.array(z.object({
    word: z.string().min(1), translation: z.string().min(1), note: z.string().min(1),
  }).strict()).max(8),
  comprehensionQuestion: z.string().min(1),
}).strict();

export const RecallEvaluationSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().min(1).max(500),
  expectedTranslation: z.string().min(1).max(200),
}).strict();
