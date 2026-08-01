import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluatePurchaseIntent } from "./rules";
import { ROUTINE_GROCERIES_INTENT, URGENT_GIFT_CARDS_INTENT } from "./scenarios";

const originalEnv = { ...process.env };

function setOpenAIEnv() {
  process.env.OPENAI_API_KEY = "sk-fixture-only-not-real";
  process.env.OPENAI_MODEL = "gpt-fixture-model";
}

// Fixture error classes mirroring the installed SDK's exported error
// hierarchy (node_modules/openai/core/error.d.ts), so categorizeOpenAIError's
// instanceof checks behave the same as against the real SDK.
class FixtureAPIUserAbortError extends Error {}
class FixtureAPIConnectionError extends Error {}
class FixtureAPIConnectionTimeoutError extends FixtureAPIConnectionError {}
class FixtureAuthenticationError extends Error {}
class FixtureRateLimitError extends Error {}
class FixtureNotFoundError extends Error {}
class FixturePermissionDeniedError extends Error {}

function mockOpenAIModule(responsesImpl: { parse: ReturnType<typeof vi.fn> }) {
  vi.doMock("openai", () => ({
    default: class MockOpenAI {
      responses = responsesImpl;
    },
    APIUserAbortError: FixtureAPIUserAbortError,
    APIConnectionTimeoutError: FixtureAPIConnectionTimeoutError,
    AuthenticationError: FixtureAuthenticationError,
    RateLimitError: FixtureRateLimitError,
    NotFoundError: FixtureNotFoundError,
    PermissionDeniedError: FixturePermissionDeniedError,
    APIConnectionError: FixtureAPIConnectionError,
  }));
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

    mockOpenAIModule({
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
    });

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation, diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(explanation.source).toBe("OPENAI");
    expect(explanation.decisionAcknowledged).toBe("APPROVE");
    expect(diagnostics.schemaValid).toBe(true);
    expect(diagnostics.responseIdSuffix).toBe("...ABCDEF");
    expect(diagnostics.failureCategory).toBeNull();
  });

  it("discards the OpenAI result and falls back if decisionAcknowledged mismatches the deterministic decision", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT); // REQUEST_TRUSTED_CONTACT

    mockOpenAIModule({
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
    });

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation, diagnostics } = await generateExplanation(URGENT_GIFT_CARDS_INTENT, evaluation);

    // Must never fail open: the deterministic REQUEST_TRUSTED_CONTACT stands.
    expect(explanation.decisionAcknowledged).toBe("REQUEST_TRUSTED_CONTACT");
    expect(explanation.source).toBe("DETERMINISTIC_FALLBACK");
    expect(diagnostics.failureCategory).toBe("DECISION_MISMATCH");
  });

  it("falls back when the structured output fails schema validation", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    mockOpenAIModule({
      parse: vi.fn().mockResolvedValue({
        id: "resp_INVALID00000000001",
        output_parsed: { decisionAcknowledged: "APPROVE" }, // missing required fields
      }),
    });

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation, diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(explanation.source).toBe("DETERMINISTIC_FALLBACK");
    expect(diagnostics.schemaValid).toBe(false);
    expect(diagnostics.failureCategory).toBe("STRUCTURED_OUTPUT_INVALID");
  });

  it("classifies a local abort as LOCAL_TIMEOUT without changing the deterministic decision", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT);

    mockOpenAIModule({ parse: vi.fn().mockRejectedValue(new FixtureAPIUserAbortError("aborted")) });

    const { generateExplanation } = await import("./openaiExplanation");
    const { explanation, diagnostics } = await generateExplanation(URGENT_GIFT_CARDS_INTENT, evaluation);

    expect(diagnostics.failureCategory).toBe("LOCAL_TIMEOUT");
    expect(explanation.source).toBe("DETERMINISTIC_FALLBACK");
    expect(explanation.decisionAcknowledged).toBe("REQUEST_TRUSTED_CONTACT");
  });

  it("classifies an SDK connection timeout as OPENAI_API_TIMEOUT", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    mockOpenAIModule({ parse: vi.fn().mockRejectedValue(new FixtureAPIConnectionTimeoutError("timed out")) });

    const { generateExplanation } = await import("./openaiExplanation");
    const { diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(diagnostics.failureCategory).toBe("OPENAI_API_TIMEOUT");
  });

  it("classifies an authentication error as AUTHENTICATION_ERROR without leaking any key material", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    mockOpenAIModule({ parse: vi.fn().mockRejectedValue(new FixtureAuthenticationError("invalid_api_key: sk-should-not-leak")) });

    const { generateExplanation } = await import("./openaiExplanation");
    const { diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(diagnostics.failureCategory).toBe("AUTHENTICATION_ERROR");
    expect(JSON.stringify(diagnostics)).not.toContain("sk-should-not-leak");
  });

  it("classifies a rate-limit error as RATE_LIMIT", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    mockOpenAIModule({ parse: vi.fn().mockRejectedValue(new FixtureRateLimitError("rate limited")) });

    const { generateExplanation } = await import("./openaiExplanation");
    const { diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(diagnostics.failureCategory).toBe("RATE_LIMIT");
  });

  it("classifies a model-not-found error as MODEL_ACCESS_ERROR", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    mockOpenAIModule({ parse: vi.fn().mockRejectedValue(new FixtureNotFoundError("model not found")) });

    const { generateExplanation } = await import("./openaiExplanation");
    const { diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(diagnostics.failureCategory).toBe("MODEL_ACCESS_ERROR");
  });

  it("classifies a generic connection error as NETWORK_ERROR", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    mockOpenAIModule({ parse: vi.fn().mockRejectedValue(new FixtureAPIConnectionError("network down")) });

    const { generateExplanation } = await import("./openaiExplanation");
    const { diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(diagnostics.failureCategory).toBe("NETWORK_ERROR");
  });

  it("classifies an unrecognized error as UNKNOWN without ever forwarding raw error content", async () => {
    setOpenAIEnv();
    const evaluation = evaluatePurchaseIntent(ROUTINE_GROCERIES_INTENT);

    mockOpenAIModule({ parse: vi.fn().mockRejectedValue(new Error("some totally unrelated internal glitch")) });

    const { generateExplanation } = await import("./openaiExplanation");
    const { diagnostics } = await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(diagnostics.failureCategory).toBe("UNKNOWN");
    expect(JSON.stringify(diagnostics)).not.toContain("some totally unrelated internal glitch");
  });

  it("calls responses.parse with store:false, no tools, maxRetries:0, and the configured timeout", async () => {
    setOpenAIEnv();
    process.env.OPENAI_TIMEOUT_MS = "45000";
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

    mockOpenAIModule({ parse: parseMock });

    const { generateExplanation } = await import("./openaiExplanation");
    await generateExplanation(ROUTINE_GROCERIES_INTENT, evaluation);

    expect(parseMock).toHaveBeenCalledTimes(1);
    const callArgs = parseMock.mock.calls[0][0];
    const callOptions = parseMock.mock.calls[0][1];
    expect(callArgs.store).toBe(false);
    expect(callArgs.tools).toBeUndefined();
    expect(callOptions.maxRetries).toBe(0);
    expect(callOptions.timeout).toBe(45000);
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

    mockOpenAIModule({ parse: parseMock });

    const { generateExplanation } = await import("./openaiExplanation");
    await generateExplanation(URGENT_GIFT_CARDS_INTENT, evaluation);

    const callArgs = parseMock.mock.calls[0][0];
    const serialized = JSON.stringify(callArgs.input);
    expect(serialized).not.toContain(URGENT_GIFT_CARDS_INTENT.userStatement);
    expect(serialized).not.toMatch(/email|phone|legalName|cvv|cardNumber|otp|passkey|sessionToken|iframeUrl/i);
  });
});
