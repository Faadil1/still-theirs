import type { PurchaseIntent } from "./types";

/** SCENARIO 1 — ROUTINE GROCERIES. Expected: APPROVE. */
export const ROUTINE_GROCERIES_INTENT: PurchaseIntent = {
  scenarioId: "routine-groceries",
  merchantLabel: "Everyday Grocery Demo",
  merchantCategory: "Groceries",
  amountCents: 4500,
  currency: "USD",
  itemCategory: "groceries",
  giftCardRequested: false,
  urgencyLevel: "none",
  recipientFamiliarity: "established",
  paymentInstructionType: "normal",
  coerciveLanguagePresent: false,
  unusualForProfile: false,
  userStatement: "Picking up the usual weekly groceries.",
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
