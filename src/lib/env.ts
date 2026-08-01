import { z } from "zod";

const serverEnvSchema = z.object({
  PRAVA_BASE_URL: z.string().url(),
  PRAVA_SECRET_KEY: z.string().min(1, "PRAVA_SECRET_KEY is required"),
  PRAVA_TEST_USER_EMAIL: z.string().email(),
  PRAVA_TEST_USER_ID: z.string().min(1),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY: z.string().min(1, "NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY is required"),
});

const healthEnvSchema = z.object({
  PRAVA_BASE_URL: z.string().url(),
});

const openaiEnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().min(1, "OPENAI_MODEL is required"),
});

export const OPENAI_TIMEOUT_MS_DEFAULT = 30000;
export const OPENAI_TIMEOUT_MS_MIN = 5000;
export const OPENAI_TIMEOUT_MS_MAX = 60000;

/**
 * Parses OPENAI_TIMEOUT_MS defensively: zero, negative, non-numeric,
 * non-integer, or out-of-range values all safely fall back to the default
 * rather than throwing — a bad timeout override must never break the route.
 */
export function parseOpenAITimeoutMs(raw: string | undefined): number {
  if (!raw) return OPENAI_TIMEOUT_MS_DEFAULT;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return OPENAI_TIMEOUT_MS_DEFAULT;
  if (n < OPENAI_TIMEOUT_MS_MIN || n > OPENAI_TIMEOUT_MS_MAX) return OPENAI_TIMEOUT_MS_DEFAULT;
  return n;
}

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;
export type HealthEnv = z.infer<typeof healthEnvSchema>;
export type OpenAIEnv = z.infer<typeof openaiEnvSchema> & { OPENAI_TIMEOUT_MS: number };

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) return cachedServerEnv;

  const parsed = serverEnvSchema.safeParse({
    PRAVA_BASE_URL: process.env.PRAVA_BASE_URL,
    PRAVA_SECRET_KEY: process.env.PRAVA_SECRET_KEY,
    PRAVA_TEST_USER_EMAIL: process.env.PRAVA_TEST_USER_EMAIL,
    PRAVA_TEST_USER_ID: process.env.PRAVA_TEST_USER_ID,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid server environment variables: ${missing}. Copy .env.example to .env.local and fill in real sandbox values.`
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

export function getHealthEnv(): HealthEnv {
  const parsed = healthEnvSchema.safeParse({
    PRAVA_BASE_URL: process.env.PRAVA_BASE_URL,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid environment variables for health check: ${missing}. Copy .env.example to .env.local and fill in real sandbox values.`
    );
  }

  return parsed.data;
}

let cachedOpenAIEnv: OpenAIEnv | null = null;

export function getOpenAIEnv(): OpenAIEnv {
  if (cachedOpenAIEnv) return cachedOpenAIEnv;

  const parsed = openaiEnvSchema.safeParse({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(
      `Missing or invalid OpenAI environment variables: ${missing}. Copy .env.example to .env.local and fill in real values.`
    );
  }

  cachedOpenAIEnv = { ...parsed.data, OPENAI_TIMEOUT_MS: parseOpenAITimeoutMs(process.env.OPENAI_TIMEOUT_MS) };
  return cachedOpenAIEnv;
}

export function getClientEnv(): ClientEnv {
  const parsed = clientEnvSchema.safeParse({
    NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing or invalid client environment variables: ${missing}.`);
  }

  return parsed.data;
}
