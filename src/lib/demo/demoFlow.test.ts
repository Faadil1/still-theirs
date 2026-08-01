import { describe, it, expect } from "vitest";
import { DemoFlowController, type AnalyzeResultShape } from "./demoFlow";

const APPROVE_RESULT: AnalyzeResultShape = {
  decision: "APPROVE",
  reasonCodes: ["ROUTINE_PURCHASE"],
  safeToCreatePravaSession: true,
  credentialCreationAllowed: true,
  explanation: {
    headline: "Ready for secure payment",
    calmExplanation: "This looks consistent with the purchase you described.",
    signals: [{ code: "ROUTINE_PURCHASE", plainLanguage: "This matches a routine, everyday purchase." }],
    questionsToConsider: [],
    nextStep: "You can continue when you're ready.",
    confidenceBand: "HIGH",
    source: "OPENAI",
  },
  proof: { pravaSessionCreated: false, paymentCredentialCreated: false },
};

const RISKY_RESULT: AnalyzeResultShape = {
  decision: "REQUEST_TRUSTED_CONTACT",
  reasonCodes: ["GIFT_CARD_REQUEST", "COERCIVE_LANGUAGE", "MULTIPLE_RISK_SIGNALS"],
  safeToCreatePravaSession: false,
  credentialCreationAllowed: false,
  explanation: {
    headline: "Pause for a second perspective",
    calmExplanation: "This purchase has a few unusual details.",
    signals: [{ code: "GIFT_CARD_REQUEST", plainLanguage: "Gift cards were requested." }],
    questionsToConsider: ["Do you know this recipient well?"],
    nextStep: "Share the purchase context with someone you trust before deciding whether to continue.",
    confidenceBand: "HIGH",
    source: "OPENAI",
  },
  proof: { pravaSessionCreated: false, paymentCredentialCreated: false },
};

describe("DemoFlowController", () => {
  it("starts at SELECT with nothing chosen", () => {
    const c = new DemoFlowController();
    expect(c.getState().view).toBe("SELECT");
    expect(c.getState().selectedScenario).toBeNull();
  });

  it("routine scenario reaches DECISION with APPROVE", () => {
    const c = new DemoFlowController();
    c.selectScenario("routine-groceries");
    expect(c.beginAnalysis()).toBe(true);
    c.completeAnalysis(APPROVE_RESULT);
    expect(c.getState().view).toBe("DECISION");
    expect(c.getState().result?.decision).toBe("APPROVE");
  });

  it("risky scenario reaches DECISION with REQUEST_TRUSTED_CONTACT", () => {
    const c = new DemoFlowController();
    c.selectScenario("urgent-gift-cards");
    c.beginAnalysis();
    c.completeAnalysis(RISKY_RESULT);
    expect(c.getState().result?.decision).toBe("REQUEST_TRUSTED_CONTACT");
  });

  it("risky result always carries pravaSessionCreated=false and paymentCredentialCreated=false", () => {
    const c = new DemoFlowController();
    c.selectScenario("urgent-gift-cards");
    c.beginAnalysis();
    c.completeAnalysis(RISKY_RESULT);
    const { result } = c.getState();
    expect(result?.proof.pravaSessionCreated).toBe(false);
    expect(result?.proof.paymentCredentialCreated).toBe(false);
  });

  it("a second beginAnalysis() call while one is in flight is rejected (no duplicate submission)", () => {
    const c = new DemoFlowController();
    c.selectScenario("routine-groceries");
    expect(c.beginAnalysis()).toBe(true);
    expect(c.beginAnalysis()).toBe(false); // still analyzing
    expect(c.getState().view).toBe("ANALYZING");
  });

  it("beginAnalysis() does nothing without a selected scenario", () => {
    const c = new DemoFlowController();
    expect(c.beginAnalysis()).toBe(false);
    expect(c.getState().view).toBe("SELECT");
  });

  it("continueToPravaPending() only transitions on an APPROVE result, and never touches Prava proof fields", () => {
    const c = new DemoFlowController();
    c.selectScenario("routine-groceries");
    c.beginAnalysis();
    c.completeAnalysis(APPROVE_RESULT);
    c.continueToPravaPending();
    expect(c.getState().view).toBe("PRAVA_PENDING");
    expect(c.getState().result?.proof.pravaSessionCreated).toBe(false);
  });

  it("continueToPravaPending() is a no-op on a REQUEST_TRUSTED_CONTACT result", () => {
    const c = new DemoFlowController();
    c.selectScenario("urgent-gift-cards");
    c.beginAnalysis();
    c.completeAnalysis(RISKY_RESULT);
    c.continueToPravaPending();
    expect(c.getState().view).toBe("DECISION"); // unchanged
  });

  it("askTrustedContact() only transitions on a REQUEST_TRUSTED_CONTACT result", () => {
    const c = new DemoFlowController();
    c.selectScenario("urgent-gift-cards");
    c.beginAnalysis();
    c.completeAnalysis(RISKY_RESULT);
    c.askTrustedContact();
    expect(c.getState().view).toBe("TRUSTED_REVIEW");
  });

  it("the trusted-contact flow only ever records a recommendation label, never a decision or credential field", () => {
    const c = new DemoFlowController();
    c.selectScenario("urgent-gift-cards");
    c.beginAnalysis();
    c.completeAnalysis(RISKY_RESULT);
    c.askTrustedContact();
    c.proceedToTrustedResponse();
    c.recordTrustedContactChoice("CONSISTENT");

    const state = c.getState();
    expect(state.view).toBe("TRUSTED_RETURN");
    expect(state.trustedContactChoice).toBe("CONSISTENT");
    // The underlying deterministic decision and proof are untouched.
    expect(state.result?.decision).toBe("REQUEST_TRUSTED_CONTACT");
    expect(state.result?.proof.pravaSessionCreated).toBe(false);
    expect(state.result?.proof.paymentCredentialCreated).toBe(false);
    expect(state.result?.credentialCreationAllowed).toBe(false);
  });

  it("recordTrustedContactChoice() is a no-op outside of TRUSTED_RESPONSE", () => {
    const c = new DemoFlowController();
    c.selectScenario("urgent-gift-cards");
    c.beginAnalysis();
    c.completeAnalysis(RISKY_RESULT);
    c.recordTrustedContactChoice("CONSISTENT"); // called too early
    expect(c.getState().trustedContactChoice).toBeNull();
    expect(c.getState().view).toBe("DECISION");
  });

  it("the DemoFlowController class has no method or field capable of creating a payment or credential", () => {
    const proto = Object.getOwnPropertyNames(DemoFlowController.prototype);
    for (const name of proto) {
      expect(name.toLowerCase()).not.toMatch(/createsession|createcredential|createpayment|collectpan/);
    }
  });

  it("reset() returns fully to scenario selection", () => {
    const c = new DemoFlowController();
    c.selectScenario("routine-groceries");
    c.beginAnalysis();
    c.completeAnalysis(APPROVE_RESULT);
    c.continueToPravaPending();
    c.reset();

    const state = c.getState();
    expect(state.view).toBe("SELECT");
    expect(state.selectedScenario).toBeNull();
    expect(state.result).toBeNull();
    expect(state.analyzing).toBe(false);
  });

  it("failAnalysis() clears the in-flight flag and returns to SELECT with a sanitized message", () => {
    const c = new DemoFlowController();
    c.selectScenario("routine-groceries");
    c.beginAnalysis();
    c.failAnalysis("Something didn't go through. You can try again.");
    expect(c.getState().analyzing).toBe(false);
    expect(c.getState().view).toBe("SELECT");
    expect(c.getState().error).toBe("Something didn't go through. You can try again.");
  });
});
