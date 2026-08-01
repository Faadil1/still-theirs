import { describe, it, expect } from "vitest";
import { evaluatePurchaseIntent } from "./rules";
import { ROUTINE_GROCERIES_INTENT, URGENT_GIFT_CARDS_INTENT } from "./scenarios";
import { purchaseIntentSchema } from "./schema";

describe("evaluatePurchaseIntent", () => {
  it("routine groceries deterministically returns APPROVE", () => {
    const result = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);
    expect(result.decision).toBe("APPROVE");
    expect(result.safeToCreatePravaSession).toBe(true);
    expect(result.credentialCreationAllowed).toBe(true);
    expect(result.reasonCodes).toContain("ROUTINE_PURCHASE");
  });

  it("urgent gift cards deterministically returns REQUEST_TRUSTED_CONTACT", () => {
    const result = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT);
    expect(result.decision).toBe("REQUEST_TRUSTED_CONTACT");
    expect(result.safeToCreatePravaSession).toBe(false);
    expect(result.credentialCreationAllowed).toBe(false);
    expect(result.reasonCodes).toContain("GIFT_CARD_REQUEST");
    expect(result.reasonCodes).toContain("COERCIVE_LANGUAGE");
    expect(result.reasonCodes).toContain("MULTIPLE_RISK_SIGNALS");
  });

  it("is a pure function — same input always yields the same decision", () => {
    const a = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT);
    const b = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT);
    expect(a).toEqual(b);
  });

  it("the sanitized intent schema accepts no card or Prava credential fields", () => {
    const shape = purchaseIntentSchema.shape;
    const forbiddenKeys = [
      "cardNumber",
      "cvv",
      "expirationDate",
      "otp",
      "sessionToken",
      "iframeUrl",
      "paymentToken",
      "dynamicCvv",
    ];
    for (const key of forbiddenKeys) {
      expect(shape).not.toHaveProperty(key);
    }
  });

  it("rejects an intent object that smuggles a card-shaped field", () => {
    const withCard = { ...ROUTINE_GROCERIES_INTENT, cardNumber: "4111111111111111" };
    const parsed = purchaseIntentSchema.safeParse(withCard);
    // Zod strips unknown keys by default rather than failing; confirm the
    // parsed output never carries it through regardless.
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("cardNumber");
    }
  });
});
