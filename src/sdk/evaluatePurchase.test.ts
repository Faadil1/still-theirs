import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { evaluatePurchase } from "./evaluatePurchase";
import type { EvaluatePurchaseInput } from "./types";

const originalEnv = { ...process.env };

const ROUTINE_GROCERIES: EvaluatePurchaseInput = {
  paymentIntent: { merchantName: "Everyday Grocery Demo", amount: 4500, currency: "USD", paymentMethod: "CARD" },
  reversibility: "DISPUTABLE",
  relationshipContext: { requesterKnown: true, firstInteraction: false },
  urgencySignals: { level: "none" },
};

const URGENT_GIFT_CARDS: EvaluatePurchaseInput = {
  paymentIntent: { merchantName: "New online contact", amount: 50000, currency: "USD", paymentMethod: "GIFT_CARD" },
  reversibility: "IRREVERSIBLE",
  relationshipContext: { requesterKnown: false, firstInteraction: true },
  urgencySignals: { level: "high", coerciveLanguagePresent: true },
};

describe("evaluatePurchase", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("maps a routine purchase deterministically to APPROVE", async () => {
    const result = await evaluatePurchase(ROUTINE_GROCERIES);
    expect(result.decision).toBe("APPROVE");
  });

  it("maps a risky gift-card context deterministically to REQUEST_TRUSTED_CONTACT", async () => {
    const result = await evaluatePurchase(URGENT_GIFT_CARDS);
    expect(result.decision).toBe("REQUEST_TRUSTED_CONTACT");
  });

  it("pravaSessionPermitted can never contradict the decision", async () => {
    const approve = await evaluatePurchase(ROUTINE_GROCERIES);
    expect(approve.decision).toBe("APPROVE");
    expect(approve.pravaSessionPermitted).toBe(true);

    const requestContact = await evaluatePurchase(URGENT_GIFT_CARDS);
    expect(requestContact.decision).toBe("REQUEST_TRUSTED_CONTACT");
    expect(requestContact.pravaSessionPermitted).toBe(false);
  });

  it("nextAction can never contradict the decision", async () => {
    const approve = await evaluatePurchase(ROUTINE_GROCERIES);
    expect(approve.nextAction).toBe("OFFER_PRAVA_VERIFICATION");

    const requestContact = await evaluatePurchase(URGENT_GIFT_CARDS);
    expect(requestContact.nextAction).toBe("OFFER_TRUSTED_PERSPECTIVE");
  });

  it("an OpenAI failure (missing env) cannot alter the deterministic result, and still returns a fallback explanation", async () => {
    // No OPENAI_API_KEY/OPENAI_MODEL set — generateExplanation must fall
    // back internally without throwing and without touching the decision.
    const result = await evaluatePurchase({ ...URGENT_GIFT_CARDS, explain: true });
    expect(result.decision).toBe("REQUEST_TRUSTED_CONTACT");
    expect(result.pravaSessionPermitted).toBe(false);
    expect(result.nextAction).toBe("OFFER_TRUSTED_PERSPECTIVE");
    expect(typeof result.explanation).toBe("string");
    expect(result.explanation!.length).toBeGreaterThan(0);
  });

  it("without explain, no explanation is generated and OpenAI is never touched", async () => {
    const result = await evaluatePurchase(ROUTINE_GROCERIES);
    expect(result.explanation).toBeUndefined();
  });

  it("the risky result exposes no field or path that could create a Prava session", async () => {
    const result = await evaluatePurchase(URGENT_GIFT_CARDS);
    const keys = Object.keys(result);
    expect(keys).not.toContain("sessionToken");
    expect(keys).not.toContain("iframeUrl");
    expect(keys).not.toContain("sessionId");
    expect(result.pravaSessionPermitted).toBe(false);
  });

  it("optional merchantContext contributes only through the existing unusualForProfile signal and cannot bypass deterministic rules", async () => {
    // merchantVerified: true on an otherwise-risky purchase must not flip
    // the decision to APPROVE — the deterministic engine, not merchant
    // verification, owns the outcome.
    const withVerifiedMerchant = await evaluatePurchase({
      ...URGENT_GIFT_CARDS,
      merchantContext: { provider: "SENSO", merchantVerified: true, merchantCategory: "Gift Cards" },
    });
    expect(withVerifiedMerchant.decision).toBe("REQUEST_TRUSTED_CONTACT");

    // merchantVerified: false on an otherwise-routine purchase adds only one
    // signal (15 points), which alone stays under the 40-point threshold.
    const withUnverifiedMerchant = await evaluatePurchase({
      ...ROUTINE_GROCERIES,
      merchantContext: { provider: "SENSO", merchantVerified: false },
    });
    expect(withUnverifiedMerchant.decision).toBe("APPROVE");
  });

  it("provider hints in merchantContext (e.g. SENSO) never trigger any network call — evaluatePurchase resolves purely from local input", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await evaluatePurchase({
      ...ROUTINE_GROCERIES,
      merchantContext: { provider: "SENSO", merchantVerified: true, policyFacts: [{ fact: "refundable", verified: true }] },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
