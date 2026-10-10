import { z } from "zod";

const EnvSchema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(1),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  GEMINI_MODEL: z.string().default("gemini-2.5-flash"),
  ALLOWED_ORIGINS: z.string().default(""),
});

export function loadConfig(env = process.env) {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment: ${result.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return {
    ...result.data,
    allowedOrigins: result.data.ALLOWED_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean),
  };
}
