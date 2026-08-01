import type { PurchaseIntent, ReasonCode, RiskEvaluation } from "./types";

const RISK_THRESHOLD = 40;

/**
 * Pure deterministic function — the only source of the routing decision.
 * OpenAI (src/lib/risk/openaiExplanation.ts) may only explain this result;
 * it can never change decision, safeToCreatePravaSession, or
 * credentialCreationAllowed.
 */
export function evaluatePurchaseIntent(intent: PurchaseIntent): RiskEvaluation {
  let score = 0;
  const reasonCodes: ReasonCode[] = [];
  const triggeredRules: string[] = [];
  let riskSignalCount = 0;

  if (intent.giftCardRequested) {
    score += 40;
    reasonCodes.push("GIFT_CARD_REQUEST");
    triggeredRules.push("R_GIFT_CARD");
    riskSignalCount += 1;
  }

  if (intent.urgencyLevel === "high") {
    score += 20;
    reasonCodes.push("URGENT_PAYMENT_REQUEST");
    triggeredRules.push("R_URGENCY");
    riskSignalCount += 1;
  }

  if (intent.recipientFamiliarity !== "established") {
    score += 20;
    reasonCodes.push("NEW_OR_UNKNOWN_RECIPIENT");
    triggeredRules.push("R_RECIPIENT_FAMILIARITY");
    riskSignalCount += 1;
  }

  if (intent.paymentInstructionType === "unusual") {
    score += 20;
    reasonCodes.push("UNUSUAL_PAYMENT_INSTRUCTION");
    triggeredRules.push("R_PAYMENT_INSTRUCTION");
    riskSignalCount += 1;
  }

  if (intent.coerciveLanguagePresent) {
    score += 30;
    reasonCodes.push("COERCIVE_LANGUAGE");
    triggeredRules.push("R_COERCIVE_LANGUAGE");
    riskSignalCount += 1;
  }

  if (intent.unusualForProfile) {
    score += 15;
    reasonCodes.push("UNUSUAL_FOR_PROFILE");
    triggeredRules.push("R_UNUSUAL_FOR_PROFILE");
    riskSignalCount += 1;
  }

  if (riskSignalCount >= 3) {
    reasonCodes.push("MULTIPLE_RISK_SIGNALS");
    triggeredRules.push("R_MULTIPLE_RISK_SIGNALS");
  }

  if (riskSignalCount === 0) {
    reasonCodes.push("ROUTINE_PURCHASE", "KNOWN_MERCHANT_PATTERN", "NORMAL_PURCHASE_AMOUNT");
    triggeredRules.push("R_ROUTINE_PURCHASE");
  }

  const decision = score >= RISK_THRESHOLD ? "REQUEST_TRUSTED_CONTACT" : "APPROVE";

  return {
    decision,
    score,
    reasonCodes,
    triggeredRules,
    safeToCreatePravaSession: decision === "APPROVE",
    credentialCreationAllowed: decision === "APPROVE",
  };
}
