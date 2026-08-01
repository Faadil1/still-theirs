import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalEnv = { ...process.env };
const originalFetch = global.fetch;

describe("createPravaSession error handling", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.PRAVA_BASE_URL = "https://sandbox.api.prava.space";
    process.env.PRAVA_SECRET_KEY = "sk_test_fixture_only";
    process.env.PRAVA_TEST_USER_EMAIL = "test@example.com";
    process.env.PRAVA_TEST_USER_ID = "still-theirs-demo-001";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it("never surfaces the raw response body — only a redacted body — on a documented API error", async () => {
    const rawErrorBody = {
      error_code: "VAL_2001",
      message: "Invalid request",
      session_token: "should-never-appear-raw",
      authorization: "Bearer should-never-appear-raw",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "x-response-id": "resp_fixture_1" }),
      json: async () => rawErrorBody,
    }) as unknown as typeof fetch;

    const { createPravaSession, PravaApiError } = await import("./server");

    await expect(createPravaSession({ externalOrderRef: "fixture-ref-1" })).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(PravaApiError);
      const apiErr = err as InstanceType<typeof PravaApiError>;
      expect(apiErr.httpStatus).toBe(400);
      const serialized = JSON.stringify(apiErr.redactedBody);
      expect(serialized).not.toContain("should-never-appear-raw");
      expect(serialized).toContain("[REDACTED]");
      return true;
    });
  });

  it("never throws with the raw response body embedded in the error message", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      json: async () => ({ session_token: "secret-fixture-value" }),
    }) as unknown as typeof fetch;

    const { createPravaSession } = await import("./server");

    try {
      await createPravaSession({ externalOrderRef: "fixture-ref-2" });
      throw new Error("expected createPravaSession to reject");
    } catch (err) {
      expect((err as Error).message).not.toContain("secret-fixture-value");
    }
  });
});
