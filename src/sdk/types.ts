/**
 * Public contract for the Still Theirs pre-credential safety SDK.
 *
 * This module has no knowledge of Prava, OpenAI, or any payment provider's
 * wire format — it only describes the shape of a purchase to be evaluated
 * and the shape of the resulting recommendation. It never creates a Prava
 * session, mounts embedded card collection, or generates a credential.
 */

export type SdkPaymentMethod = "CARD" | "GIFT_CARD" | "BANK_TRANSFER" | "OTHER";

export type SdkReversibility = "REVERSIBLE" | "DISPUTABLE" | "IRREVERSIBLE";

export type SdkUrgencyLevel = "none" | "low" | "high";

export type SdkDecision = "APPROVE" | "REQUEST_TRUSTED_CONTACT";

export type SdkNextAction = "OFFER_PRAVA_VERIFICATION" | "OFFER_TRUSTED_PERSPECTIVE";

export interface PaymentIntentInput {
  merchantName: string;
  /** In the smallest currency unit (e.g. cents), matching the existing engine's amountCents convention. */
  amount: number;
  currency: string;
  paymentMethod: SdkPaymentMethod;
}

export interface RelationshipContextInput {
  requesterKnown: boolean;
  firstInteraction: boolean;
}

export interface UrgencySignalsInput {
  level: SdkUrgencyLevel;
  coerciveLanguagePresent?: boolean;
}

export interface MerchantPolicyFact {
  fact: string;
  source?: string;
  verified?: boolean;
}

/**
 * Provider-neutral evidence about the merchant. Deliberately shaped so a
 * future Senso adapter can populate it without changing this contract —
 * this SDK never calls Senso and never contacts `provider` itself.
 */
export interface MerchantContextInput {
  provider?: "SENSO" | "APPLICATION" | "OTHER";
  merchantVerified?: boolean;
  merchantCategory?: string;
  policyFacts?: MerchantPolicyFact[];
}

export interface EvaluatePurchaseInput {
  paymentIntent: PaymentIntentInput;
  reversibility: SdkReversibility;
  relationshipContext: RelationshipContextInput;
  urgencySignals: UrgencySignalsInput;
  /** When true, requests a plain-language explanation via OpenAI. Never affects the decision. */
  explain?: boolean;
  merchantContext?: MerchantContextInput;
}

export interface RuleResult {
  code: string;
  triggered: boolean;
}

export interface EvaluatePurchaseResult {
  decision: SdkDecision;
  /** Whether the application may offer the user a Prava verification step. Never a session, never a credential. */
  pravaSessionPermitted: boolean;
  reasonCodes: string[];
  ruleTrace: RuleResult[];
  explanation?: string;
  nextAction: SdkNextAction;
}

// ---------------------------------------------------------------------------
// Optional future partner extension points.
//
// These are type-only declarations with no implementation, no network
// dependency, and no runtime behavior. They exist so that a future Linq,
// Senso, or NANDA adapter can be written against a stable shape without
// this SDK importing, calling, or depending on any of those providers.
// ---------------------------------------------------------------------------

export interface TrustedPerspectiveRequest {
  decision: SdkDecision;
  reasonCodes: string[];
  merchantName: string;
}

export interface TrustedPerspectiveResult {
  /**
   * "PENDING" covers a provider that has requested delivery of a
   * perspective message but has no webhook/callback wired up yet to learn
   * the trusted contact's actual answer — e.g. the current Linq adapter in
   * src/lib/linq/server.ts. It is never treated as a decision override.
   */
  recommendation: "CONSISTENT" | "RECOMMEND_PAUSE" | "PENDING";
}

/** Future Linq adapter shape. Not implemented or called by this SDK. */
export interface TrustedPerspectiveProvider {
  sendPerspectiveRequest(input: TrustedPerspectiveRequest): Promise<TrustedPerspectiveResult>;
}

export interface MerchantContextRequest {
  merchantName: string;
}

/** Future Senso adapter shape. Not implemented or called by this SDK. */
export interface MerchantContextProvider {
  getMerchantContext(input: MerchantContextRequest): Promise<MerchantContextInput>;
}

/** Future NANDA compatibility descriptor. Metadata only — no runtime behavior. */
export interface AgentAdapterMetadata {
  agentId: string;
  agentName: string;
  protocolVersion: string;
  capabilities: string[];
}
