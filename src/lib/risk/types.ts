export type RiskDecision = "APPROVE" | "REQUEST_TRUSTED_CONTACT";

export type ReasonCode =
  | "ROUTINE_PURCHASE"
  | "KNOWN_MERCHANT_PATTERN"
  | "NORMAL_PURCHASE_AMOUNT"
  | "GIFT_CARD_REQUEST"
  | "URGENT_PAYMENT_REQUEST"
  | "NEW_OR_UNKNOWN_RECIPIENT"
  | "UNUSUAL_PAYMENT_INSTRUCTION"
  | "COERCIVE_LANGUAGE"
  | "UNUSUAL_FOR_PROFILE"
  | "MULTIPLE_RISK_SIGNALS";

export type UrgencyLevel = "none" | "low" | "high";
export type RecipientFamiliarity = "established" | "new" | "unknown";
export type PaymentInstructionType = "normal" | "unusual";
export type ConfidenceBand = "LOW" | "MEDIUM" | "HIGH";
export type ExplanationSource = "OPENAI" | "DETERMINISTIC_FALLBACK";

/** Sanitized purchase-intent features only — never card, identity, or credential fields. */
export interface PurchaseIntent {
  scenarioId: string;
  merchantLabel: string;
  merchantCategory: string;
  amountCents: number;
  currency: string;
  itemCategory: string;
  giftCardRequested: boolean;
  urgencyLevel: UrgencyLevel;
  recipientFamiliarity: RecipientFamiliarity;
  paymentInstructionType: PaymentInstructionType;
  coerciveLanguagePresent: boolean;
  unusualForProfile: boolean;
  userStatement: string;
}

export interface RiskEvaluation {
  decision: RiskDecision;
  score: number;
  reasonCodes: ReasonCode[];
  triggeredRules: string[];
  safeToCreatePravaSession: boolean;
  credentialCreationAllowed: boolean;
}

export interface ExplanationSignal {
  code: string;
  plainLanguage: string;
}

export interface StructuredExplanation {
  decisionAcknowledged: RiskDecision;
  headline: string;
  calmExplanation: string;
  signals: ExplanationSignal[];
  questionsToConsider: string[];
  nextStep: string;
  confidenceBand: ConfidenceBand;
}

export interface ExplanationResult extends StructuredExplanation {
  source: ExplanationSource;
}
