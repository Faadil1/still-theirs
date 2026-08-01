import "server-only";
import OpenAI, {
  APIUserAbortError,
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
  NotFoundError,
  PermissionDeniedError,
  APIConnectionError,
} from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIEnv } from "@/lib/env";
import { suffix6 } from "@/lib/prava/redact";
import { structuredExplanationSchema } from "./schema";
import type { PurchaseIntent, RiskEvaluation, ExplanationResult, StructuredExplanation } from "./types";

export type OpenAIFailureCategory =
  | "LOCAL_TIMEOUT"
  | "OPENAI_API_TIMEOUT"
  | "AUTHENTICATION_ERROR"
  | "RATE_LIMIT"
  | "MODEL_ACCESS_ERROR"
  | "NETWORK_ERROR"
  | "STRUCTURED_OUTPUT_INVALID"
  | "DECISION_MISMATCH"
  | "UNKNOWN";

/**
 * Classifies a caught error into a small, sanitized category. Never
 * inspects or forwards the raw error message/body/stack.
 */
function categorizeOpenAIError(err: unknown): OpenAIFailureCategory {
  if (err instanceof APIUserAbortError) return "LOCAL_TIMEOUT";
  if (err instanceof APIConnectionTimeoutError) return "OPENAI_API_TIMEOUT";
  if (err instanceof AuthenticationError) return "AUTHENTICATION_ERROR";
  if (err instanceof RateLimitError) return "RATE_LIMIT";
  if (err instanceof NotFoundError || err instanceof PermissionDeniedError) return "MODEL_ACCESS_ERROR";
  if (err instanceof APIConnectionError) return "NETWORK_ERROR";
  return "UNKNOWN";
}

export interface ExplanationDiagnostics {
  schemaValid: boolean;
  responseIdSuffix: string | null;
  latencyMs: number;
  modelUsed: string | null;
  httpSuccess: boolean;
  failureCategory: OpenAIFailureCategory | null;
}

export interface ExplanationOutcome {
  explanation: ExplanationResult;
  diagnostics: ExplanationDiagnostics;
}

/**
 * Only these sanitized, non-identifying features are ever sent to OpenAI.
 * Deliberately excludes userStatement, scenarioId's free text, and any
 * card/identity/credential field — see docs/SECURITY_NOTES.md.
 */
function buildSanitizedPayload(intent: PurchaseIntent, evaluation: RiskEvaluation) {
  return {
    merchantLabel: intent.merchantLabel,
    merchantCategory: intent.merchantCategory,
    amountCents: intent.amountCents,
    currency: intent.currency,
    itemCategory: intent.itemCategory,
    giftCardRequested: intent.giftCardRequested,
    urgencyLevel: intent.urgencyLevel,
    recipientFamiliarity: intent.recipientFamiliarity,
    paymentInstructionType: intent.paymentInstructionType,
    coerciveLanguagePresent: intent.coerciveLanguagePresent,
    unusualForProfile: intent.unusualForProfile,
    deterministicDecision: evaluation.decision,
    deterministicReasonCodes: evaluation.reasonCodes,
  };
}

function humanizeReasonCode(code: string): string {
  const map: Record<string, string> = {
    ROUTINE_PURCHASE: "This matches a routine, everyday purchase.",
    KNOWN_MERCHANT_PATTERN: "The merchant matches a familiar pattern.",
    NORMAL_PURCHASE_AMOUNT: "The amount is in a typical range.",
    GIFT_CARD_REQUEST: "Gift cards were requested.",
    URGENT_PAYMENT_REQUEST: "The request emphasized urgency.",
    NEW_OR_UNKNOWN_RECIPIENT: "The recipient isn't an established contact.",
    UNUSUAL_PAYMENT_INSTRUCTION: "The payment instructions are unusual.",
    COERCIVE_LANGUAGE: "The wording included pressuring language.",
    UNUSUAL_FOR_PROFILE: "This differs from the usual pattern.",
    MULTIPLE_RISK_SIGNALS: "Several unusual signals appeared together.",
  };
  return map[code] ?? "An additional signal was noted.";
}

/** Local, fully deterministic explanation — used whenever OpenAI is unavailable, times out, errors, or disagrees. */
export function buildDeterministicExplanation(evaluation: RiskEvaluation): StructuredExplanation {
  if (evaluation.decision === "APPROVE") {
    return {
      decisionAcknowledged: "APPROVE",
      headline: "Ready for secure payment",
      calmExplanation: "This looks consistent with the purchase you described.",
      signals: evaluation.reasonCodes.map((code) => ({ code, plainLanguage: humanizeReasonCode(code) })),
      questionsToConsider: [],
      nextStep: "You can continue when you're ready.",
      confidenceBand: "MEDIUM",
    };
  }
  return {
    decisionAcknowledged: "REQUEST_TRUSTED_CONTACT",
    headline: "Pause for a second perspective",
    calmExplanation:
      "This purchase has a few unusual details. Taking a moment for a second perspective can help you decide with confidence.",
    signals: evaluation.reasonCodes.map((code) => ({ code, plainLanguage: humanizeReasonCode(code) })),
    questionsToConsider: ["Do you know this recipient well?", "Is there any pressure to act quickly?"],
    nextStep: "Share the purchase context with someone you trust before deciding whether to continue.",
    confidenceBand: "MEDIUM",
  };
}

function fallback(
  evaluation: RiskEvaluation,
  diagnostics: Omit<ExplanationDiagnostics, "modelUsed">,
  modelUsed: string | null
): ExplanationOutcome {
  return {
    explanation: { ...buildDeterministicExplanation(evaluation), source: "DETERMINISTIC_FALLBACK" },
    diagnostics: { ...diagnostics, modelUsed },
  };
}

export async function generateExplanation(intent: PurchaseIntent, evaluation: RiskEvaluation): Promise<ExplanationOutcome> {
  const startedAt = Date.now();

  let apiKey: string;
  let model: string;
  let timeoutMs: number;
  try {
    ({ OPENAI_API_KEY: apiKey, OPENAI_MODEL: model, OPENAI_TIMEOUT_MS: timeoutMs } = getOpenAIEnv());
  } catch {
    return fallback(
      evaluation,
      { schemaValid: false, responseIdSuffix: null, latencyMs: Date.now() - startedAt, httpSuccess: false, failureCategory: null },
      null
    );
  }

  const client = new OpenAI({ apiKey });
  const payload = buildSanitizedPayload(intent, evaluation);

  try {
    // Single authoritative deadline: the SDK's own per-request `timeout`,
    // with `maxRetries: 0` so one call here means at most one outgoing
    // HTTP request. No separate AbortController is used, to avoid
    // stacking competing timeouts.
    const response = await client.responses.parse(
      {
        model,
        store: false,
        input: [
          {
            role: "system",
            content:
              "You explain a purchase-safety decision calmly and factually, in plain language. " +
              "You never override, second-guess, or contradict the deterministic decision provided to you — " +
              "you only explain it. decisionAcknowledged must exactly equal the given deterministic decision. " +
              "Never say the transaction was blocked, that the user is vulnerable or incapable, that a guardian " +
              "must be contacted, or that a merchant/recipient is criminal. Never claim a scam was detected — " +
              "only describe unusual signals neutrally. Keep an autonomy-preserving, non-paternalistic tone.",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
        text: { format: zodTextFormat(structuredExplanationSchema, "purchase_explanation") },
      },
      { timeout: timeoutMs, maxRetries: 0 }
    );

    const latencyMs = Date.now() - startedAt;
    const responseIdSuffix = suffix6(response.id);

    const parsed = response.output_parsed;
    if (!parsed) {
      return fallback(
        evaluation,
        { schemaValid: false, responseIdSuffix, latencyMs, httpSuccess: true, failureCategory: "STRUCTURED_OUTPUT_INVALID" },
        model
      );
    }

    // The deterministic decision is authoritative. A mismatch discards the
    // OpenAI output entirely rather than trusting it.
    if (parsed.decisionAcknowledged !== evaluation.decision) {
      return fallback(
        evaluation,
        { schemaValid: false, responseIdSuffix, latencyMs, httpSuccess: true, failureCategory: "DECISION_MISMATCH" },
        model
      );
    }

    const revalidated = structuredExplanationSchema.safeParse(parsed);
    if (!revalidated.success) {
      return fallback(
        evaluation,
        { schemaValid: false, responseIdSuffix, latencyMs, httpSuccess: true, failureCategory: "STRUCTURED_OUTPUT_INVALID" },
        model
      );
    }

    return {
      explanation: { ...revalidated.data, source: "OPENAI" },
      diagnostics: { schemaValid: true, responseIdSuffix, latencyMs, modelUsed: model, httpSuccess: true, failureCategory: null },
    };
  } catch (err) {
    return fallback(
      evaluation,
      {
        schemaValid: false,
        responseIdSuffix: null,
        latencyMs: Date.now() - startedAt,
        httpSuccess: false,
        failureCategory: categorizeOpenAIError(err),
      },
      model
    );
  }
}
