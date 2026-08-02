/**
 * Minimal external-caller example for the Still Theirs pre-credential
 * safety SDK. Demonstrates the two locked demo scenarios. Neither branch
 * creates a Prava session, calls Linq, or makes a live OpenAI call.
 */
import { evaluatePurchase, type EvaluatePurchaseInput } from "../src/sdk";

async function main() {
  // 1. Routine groceries — expected APPROVE.
  const routineGroceries: EvaluatePurchaseInput = {
    paymentIntent: {
      merchantName: "Everyday Grocery Demo",
      amount: 4500,
      currency: "USD",
      paymentMethod: "CARD",
    },
    reversibility: "DISPUTABLE",
    relationshipContext: { requesterKnown: true, firstInteraction: false },
    urgencySignals: { level: "none" },
  };

  const routineResult = await evaluatePurchase(routineGroceries);
  console.log("Routine groceries decision:", routineResult.decision);
  if (routineResult.pravaSessionPermitted) {
    console.log("The application may OFFER Prava verification (no session created).");
  }

  // 2. Urgent gift cards — expected REQUEST_TRUSTED_CONTACT.
  const urgentGiftCards: EvaluatePurchaseInput = {
    paymentIntent: {
      merchantName: "New online contact",
      amount: 50000,
      currency: "USD",
      paymentMethod: "GIFT_CARD",
    },
    reversibility: "IRREVERSIBLE",
    relationshipContext: { requesterKnown: false, firstInteraction: true },
    urgencySignals: { level: "high", coerciveLanguagePresent: true },
  };

  const riskyResult = await evaluatePurchase(urgentGiftCards);
  console.log("Urgent gift cards decision:", riskyResult.decision);
  console.log("Prava calls: 0");
  console.log("Credentials created: 0");
  if (!riskyResult.pravaSessionPermitted) {
    console.log("Offering a trusted perspective instead (no Linq or Prava call made).");
  }
}

void main();
