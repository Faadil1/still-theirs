import { describe, it, expect } from "vitest";
import { ROUTINE_GROCERIES_INTENT } from "./scenarios";

function formatAmount(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

describe("ROUTINE_GROCERIES_INTENT (E039 — Gumroad controlled sandbox checkout facts)", () => {
  it("uses the exact Gumroad purchase facts, not the prior grocery placeholder", () => {
    expect(ROUTINE_GROCERIES_INTENT.merchantLabel).toBe("Gumroad");
    expect(ROUTINE_GROCERIES_INTENT.merchantCategory).toBe("Digital Goods");
    expect(ROUTINE_GROCERIES_INTENT.amountCents).toBe(489);
    expect(ROUTINE_GROCERIES_INTENT.currency).toBe("CAD");
    expect(ROUTINE_GROCERIES_INTENT.itemCategory).toBe("digital_product");
    expect(ROUTINE_GROCERIES_INTENT.giftCardRequested).toBe(false);
    expect(ROUTINE_GROCERIES_INTENT.urgencyLevel).toBe("none");
    expect(ROUTINE_GROCERIES_INTENT.recipientFamiliarity).toBe("established");
    expect(ROUTINE_GROCERIES_INTENT.paymentInstructionType).toBe("normal");
    expect(ROUTINE_GROCERIES_INTENT.coerciveLanguagePresent).toBe(false);
    expect(ROUTINE_GROCERIES_INTENT.unusualForProfile).toBe(false);
  });

  it("keeps the internal scenarioId unchanged (\"routine-groceries\") despite the updated purchase facts", () => {
    expect(ROUTINE_GROCERIES_INTENT.scenarioId).toBe("routine-groceries");
  });

  it("formats to the exact displayed maximum amount, CA$4.89", () => {
    expect(formatAmount(ROUTINE_GROCERIES_INTENT.amountCents, ROUTINE_GROCERIES_INTENT.currency)).toBe("CA$4.89");
  });

  it("never mentions groceries, the prior placeholder merchant, or a USD amount outside the intentionally-unchanged scenarioId", () => {
    expect(ROUTINE_GROCERIES_INTENT.merchantLabel).not.toMatch(/grocer/i);
    expect(ROUTINE_GROCERIES_INTENT.merchantCategory).not.toMatch(/grocer/i);
    expect(ROUTINE_GROCERIES_INTENT.itemCategory).not.toMatch(/grocer/i);
    expect(ROUTINE_GROCERIES_INTENT.userStatement).not.toMatch(/grocer/i);
    expect(ROUTINE_GROCERIES_INTENT.merchantLabel).not.toBe("Everyday Grocery Demo");
    expect(ROUTINE_GROCERIES_INTENT.currency).not.toBe("USD");
  });
});
