import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIEnv } from "@/lib/env";
import { suffix6 } from "@/lib/prava/redact";
import { structuredExplanationSchema } from "./schema";
import type { PurchaseIntent, RiskEvaluation, ExplanationResult, StructuredExplanation } from "./types";

const TIMEOUT_MS = 8000;

export interface ExplanationDiagnostics {
  schemaValid: boolean;
  responseIdSuffix: string | null;
  latencyMs: number;
  modelUsed: string | null;
  httpSuccess: boolean;
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

function fallback(evaluation: RiskEvaluation, diagnostics: Omit<ExplanationDiagnostics, "modelUsed">, modelUsed: string | null): ExplanationOutcome {
  return {
    explanation: { ...buildDeterministicExplanation(evaluation), source: "DETERMINISTIC_FALLBACK" },
    diagnostics: { ...diagnostics, modelUsed },
  };
}

export async function generateExplanation(intent: PurchaseIntent, evaluation: RiskEvaluation): Promise<ExplanationOutcome> {
  const startedAt = Date.now();

  let apiKey: string;
  let model: string;
  try {
    ({ OPENAI_API_KEY: apiKey, OPENAI_MODEL: model } = getOpenAIEnv());
  } catch {
    return fallback(evaluation, { schemaValid: false, responseIdSuffix: null, latencyMs: Date.now() - startedAt, httpSuccess: false }, null);
  }

  const client = new OpenAI({ apiKey });
  const payload = buildSanitizedPayload(intent, evaluation);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
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
      { signal: controller.signal }
    );

    clearTimeout(timer);
    const latencyMs = Date.now() - startedAt;
    const responseIdSuffix = suffix6(response.id);

    const parsed = response.output_parsed;
    if (!parsed) {
      return fallback(evaluation, { schemaValid: false, responseIdSuffix, latencyMs, httpSuccess: true }, model);
    }

    // The deterministic decision is authoritative. A mismatch discards the
    // OpenAI output entirely rather than trusting it.
    if (parsed.decisionAcknowledged !== evaluation.decision) {
      return fallback(evaluation, { schemaValid: false, responseIdSuffix, latencyMs, httpSuccess: true }, model);
    }

    const revalidated = structuredExplanationSchema.safeParse(parsed);
    if (!revalidated.success) {
      return fallback(evaluation, { schemaValid: false, responseIdSuffix, latencyMs, httpSuccess: true }, model);
    }

    return {
      explanation: { ...revalidated.data, source: "OPENAI" },
      diagnostics: { schemaValid: true, responseIdSuffix, latencyMs, modelUsed: model, httpSuccess: true },
    };
  } catch {
    clearTimeout(timer);
    return fallback(evaluation, { schemaValid: false, responseIdSuffix: null, latencyMs: Date.now() - startedAt, httpSuccess: false }, model);
  }
}
