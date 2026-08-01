import { z } from "zod";

/**
 * Sanitized purchase-intent schema. Deliberately excludes any card,
 * identity, contact, or credential field — see docs/SECURITY_NOTES.md.
 */
export const purchaseIntentSchema = z.object({
  scenarioId: z.string().min(1).max(64),
  merchantLabel: z.string().min(1).max(120),
  merchantCategory: z.string().min(1).max(60),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  itemCategory: z.string().min(1).max(60),
  giftCardRequested: z.boolean(),
  urgencyLevel: z.enum(["none", "low", "high"]),
  recipientFamiliarity: z.enum(["established", "new", "unknown"]),
  paymentInstructionType: z.enum(["normal", "unusual"]),
  coerciveLanguagePresent: z.boolean(),
  unusualForProfile: z.boolean(),
  userStatement: z.string().max(500),
});

export const riskEvaluationSchema = z.object({
  decision: z.enum(["APPROVE", "REQUEST_TRUSTED_CONTACT"]),
  score: z.number(),
  reasonCodes: z.array(
    z.enum([
      "ROUTINE_PURCHASE",
      "KNOWN_MERCHANT_PATTERN",
      "NORMAL_PURCHASE_AMOUNT",
      "GIFT_CARD_REQUEST",
      "URGENT_PAYMENT_REQUEST",
      "NEW_OR_UNKNOWN_RECIPIENT",
      "UNUSUAL_PAYMENT_INSTRUCTION",
      "COERCIVE_LANGUAGE",
      "UNUSUAL_FOR_PROFILE",
      "MULTIPLE_RISK_SIGNALS",
    ])
  ),
  triggeredRules: z.array(z.string()),
  safeToCreatePravaSession: z.boolean(),
  credentialCreationAllowed: z.boolean(),
});

/** Strict structured schema OpenAI must satisfy. Used with zodTextFormat(). */
export const structuredExplanationSchema = z.object({
  decisionAcknowledged: z.enum(["APPROVE", "REQUEST_TRUSTED_CONTACT"]),
  headline: z.string().min(1).max(120),
  calmExplanation: z.string().min(1).max(600),
  signals: z.array(
    z.object({
      code: z.string().min(1).max(64),
      plainLanguage: z.string().min(1).max(200),
    })
  ),
  questionsToConsider: z.array(z.string().min(1).max(200)),
  nextStep: z.string().min(1).max(300),
  confidenceBand: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

export const explanationResultSchema = structuredExplanationSchema.extend({
  source: z.enum(["OPENAI", "DETERMINISTIC_FALLBACK"]),
});
