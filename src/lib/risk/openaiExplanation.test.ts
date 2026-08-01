import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluatePurchaseIntent } from "./rules";
import { ROUTINE_GROCERIES_INTENT, URGENT_GIFT_CARDS_INTENT } from "./scenarios";

const originalEnv = { ...process.env };

function setOpenAIEnv() {
  process.env.OPENAI_API_KEY = "sk-fixture-only-not-real";
  process.env.OPENAI_MODEL = "gpt-fixture-model";
}

describe("generateExplanation", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.doUnmock("openai");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("falls back to the deterministic explanation without an OpenAI key configured", async () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;

    const { generateExplanation } = await import("./openaiExplanation");
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);
    const { explanation, diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(explanation.source).toBe("DETERMINISTIC_FALLBACK");
    expect(explanation.decisionAcknowledged).toBe("APPROVE");
    expect(diagnostics.httpSuccess).toBe(false);
  });

  it("uses the OpenAI structured result when it matches the deterministic decision", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          parse: vi.fn().mockResolvedValue({
            id: "resp_FIXTUREONLY0000ABCDEF",
            output_parsed: {
              decisionAcknowledged: "APPROVE",
              headline: "Ready for secure payment",
              calmExplanation: "This looks consistent with the purchase you described.",
              signals: [{ code: "ROUTINE_PURCHASE", plainLanguage: "Routine purchase." }],
              questionsToConsider: [],
              nextStep: "You can continue when you're ready.",
              confidenceBand: "HIGH",
            },
          }),
        };
      },
    }));

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation, diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(explanation.source).toBe("OPENAI");
    expect(explanation.decisionAcknowledged).toBe("APPROVE");
    expect(diagnostics.schemaValid).toBe(true);
    expect(diagnostics.responseIdSuffix).toBe("...ABCDEF");
  });

  it("discards the OpenAI result and falls back if decisionAcknowledged mismatches the deterministic decision", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT); // REQUEST_TRUSTED_CONTACT

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          parse: vi.fn().mockResolvedValue({
            id: "resp_MISMATCH0000000001",
            output_parsed: {
              decisionAcknowledged: "APPROVE", // mismatched on purpose
              headline: "Ready for secure payment",
              calmExplanation: "Looks fine.",
              signals: [],
              questionsToConsider: [],
              nextStep: "Continue.",
              confidenceBand: "HIGH",
            },
          }),
        };
      },
    }));

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation } = await generateExplanation(URGENT_GIFT_CARDS_INTENT, evaluation);

    // Must never fail open: the deterministic REQUEST_TRUSTED_CONTACT stands.
    expect(explanation.decisionAcknowledged).toBe("REQUEST_TRUSTED_CONTACT");
    expect(explanation.source).toBe("DETERMINISTIC_FALLBACK");
  });

  it("falls back when the structured output fails schema validation", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          parse: vi.fn().mockResolvedValue({
            id: "resp_INVALID00000000001",
            output_parsed: { decisionAcknowledged: "APPROVE" }, // missing required fields
          }),
        };
      },
    }));

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation, diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(explanation.source).toBe("DETERMINISTIC_FALLBACK");
    expect(diagnostics.schemaValid).toBe(false);
  });

  it("falls back when the OpenAI call throws/times out, without changing the deterministic decision", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT);

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = {
          parse: vi.fn().mockRejectedValue(new Error("simulated timeout")),
        };
      },
    }));

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation } = await generateExplanation(URGENT_GIFT_CARDS_INTENT, evaluation);

    expect(explanation.source).toBe("DETERMINISTIC_FALLBACK");
    expect(explanation.decisionAcknowledged).toBe("REQUEST_TRUSTED_CONTACT");
  });

  it("calls responses.parse with store:false and no tools", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);
    const parseMock = vi.fn().mockResolvedValue({
      id: "resp_STOREFALSE0000000001",
      output_parsed: {
        decisionAcknowledged: "APPROVE",
        headline: "h",
        calmExplanation: "c",
        signals: [],
        questionsToConsider: [],
        nextStep: "n",
        confidenceBand: "HIGH",
      },
    });

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = { parse: parseMock };
      },
    }));

    const { generateExplanation } = await import("./openaiExplanation");
    await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(parseMock).toHaveBeenCalledTimes(1);
    const callArgs = parseMock.mock.calls[0][0];
    expect(callArgs.store).toBe(false);
    expect(callArgs.tools).toBeUndefined();
  });

  it("never sends userStatement, and never sends card/identity fields, to the OpenAI request payload", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT);
    const parseMock = vi.fn().mockResolvedValue({
      id: "resp_PRIVACY000000000001",
      output_parsed: {
        decisionAcknowledged: "REQUEST_TRUSTED_CONTACT",
        headline: "h",
        calmExplanation: "c",
        signals: [],
        questionsToConsider: [],
        nextStep: "n",
        confidenceBand: "HIGH",
      },
    });

    vi.doMock("openai", () => ({
      default: class MockOpenAI {
        responses = { parse: parseMock };
      },
    }));

    const { generateExplanation } = await import("./openaiExplanation");
    await generateExplanation(URGENT_GIFT_CARDS_INTENT, evaluation);

    const callArgs = parseMock.mock.calls[0][0];
    const serialized = JSON.stringify(callArgs.input);
    expect(serialized).not.toContain(URGENT_GIFT_CARDS_INTENT.userStatement);
    expect(serialized).not.toMatch(/email|phone|legalName|cvv|cardNumber|otp|passkey|sessionToken|iframeUrl/i);
  });
});
