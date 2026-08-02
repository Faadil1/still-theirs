import type { PurchaseIntent } from "./types";

/**
 * SCENARIO 1 — ROUTINE DIGITAL PURCHASE (Gumroad). Expected: APPROVE.
 * scenarioId is intentionally left as "routine-groceries" — it is only an
 * internal key (used by DEMO_SCENARIOS, DemoFlowController, and tests) and
 * renaming it would touch far more surface area than the underlying
 * purchase facts warrant.
 */
export const ROUTINE_GROCERIES_INTENT: PurchaseIntent = {
  scenarioId: "routine-groceries",
  merchantLabel: "Gumroad",
  merchantCategory: "Digital Goods",
  amountCents: 489,
  currency: "CAD",
  itemCategory: "digital_product",
  giftCardRequested: false,
  urgencyLevel: "none",
  recipientFamiliarity: "established",
  paymentInstructionType: "normal",
  coerciveLanguagePresent: false,
  unusualForProfile: false,
  userStatement: "Purchasing a low-cost digital cookbook from Gumroad.",
};

/** SCENARIO 2 — URGENT GIFT CARDS. Expected: REQUEST_TRUSTED_CONTACT. */
export const URGENT_GIFT_CARDS_INTENT: PurchaseIntent = {
  scenarioId: "urgent-gift-cards",
  merchantLabel: "New online contact",
  merchantCategory: "Gift Cards",
  amountCents: 50000,
  currency: "USD",
  itemCategory: "gift_cards",
  giftCardRequested: true,
  urgencyLevel: "high",
  recipientFamiliarity: "new",
  paymentInstructionType: "unusual",
  coerciveLanguagePresent: true,
  unusualForProfile: true,
  userStatement: "Someone I just met online says they urgently need five $100 gift cards today.",
};

export const DEMO_SCENARIOS = {
  "routine-groceries": ROUTINE_GROCERIES_INTENT,
  "urgent-gift-cards": URGENT_GIFT_CARDS_INTENT,
} as const;

export type DemoScenarioId = keyof typeof DEMO_SCENARIOS;
