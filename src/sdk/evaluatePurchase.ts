import { evaluatePurchaseIntent } from "@/lib/risk/rules";
import type { PurchaseIntent } from "@/lib/risk/types";
import type { EvaluatePurchaseInput, EvaluatePurchaseResult, RuleResult } from "./types";

/**
 * Maps the public SDK input into the existing internal PurchaseIntent shape
 * so the already-validated deterministic engine (src/lib/risk/rules.ts) can
 * be reused unchanged. userStatement is always empty here — the SDK never
 * accepts or forwards free-text user statements.
 */
function toPurchaseIntent(input: EvaluatePurchaseInput): PurchaseIntent {
  const { paymentIntent, reversibility, relationshipContext, urgencySignals, merchantContext } = input;

  const recipientFamiliarity: PurchaseIntent["recipientFamiliarity"] = relationshipContext.requesterKnown
    ? "established"
    : relationshipContext.firstInteraction
      ? "new"
      : "unknown";

  return {
    scenarioId: "sdk-evaluation",
    merchantLabel: paymentIntent.merchantName,
    merchantCategory: merchantContext?.merchantCategory ?? "general",
    amountCents: paymentIntent.amount,
    currency: paymentIntent.currency,
    itemCategory: merchantContext?.merchantCategory ?? "general",
    giftCardRequested: paymentIntent.paymentMethod === "GIFT_CARD",
    urgencyLevel: urgencySignals.level,
    recipientFamiliarity,
    paymentInstructionType: reversibility === "IRREVERSIBLE" ? "unusual" : "normal",
    coerciveLanguagePresent: urgencySignals.coerciveLanguagePresent ?? false,
    unusualForProfile: merchantContext?.merchantVerified === false,
    userStatement: "",
  };
}

function toRuleTrace(reasonCodes: string[]): RuleResult[] {
  return reasonCodes.map((code) => ({ code, triggered: true }));
}

/**
 * Pre-credential safety check for Prava-powered commerce agents. Answers
 * only "may this application offer the user a Prava verification step right
 * now?" — it never creates a Prava session, initializes the embedded card
 * SDK, mounts card collection, or generates a credential itself. Reaching
 * pravaSessionPermitted === true still requires the calling application to
 * take its own explicit, user-initiated action before any session exists.
 *
 * The deterministic engine is the sole source of the decision. When
 * `explain` is requested, OpenAI (via the existing generateExplanation) may
 * only narrate that decision in plain language — it can never change it,
 * and any OpenAI failure silently falls back to a deterministic explanation
 * without touching the decision, exactly as it already does for /demo.
 */
export async function evaluatePurchase(input: EvaluatePurchaseInput): Promise<EvaluatePurchaseResult> {
  const intent = toPurchaseIntent(input);
  const evaluation = evaluatePurchaseIntent(intent);

  const decision = evaluation.decision;
  const pravaSessionPermitted = decision === "APPROVE";
  const nextAction: EvaluatePurchaseResult["nextAction"] =
    decision === "APPROVE" ? "OFFER_PRAVA_VERIFICATION" : "OFFER_TRUSTED_PERSPECTIVE";

  let explanation: string | undefined;
  if (input.explain) {
    // Dynamically imported so that callers who never request an explanation
    // — the common case for a pre-credential check — never load the OpenAI
    // client or trigger the "server-only" marker module at all.
    const { generateExplanation } = await import("@/lib/risk/openaiExplanation");
    const outcome = await generateExplanation(intent, evaluation);
    explanation = outcome.explanation.calmExplanation;
  }

  return {
    decision,
    pravaSessionPermitted,
    reasonCodes: evaluation.reasonCodes,
    ruleTrace: toRuleTrace(evaluation.reasonCodes),
    explanation,
    nextAction,
  };
}
