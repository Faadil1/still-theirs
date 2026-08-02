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

  it("sends the exact Gumroad E039 purchase facts in the session request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      json: async () => ({
        session_id: "ses_fixture",
        order_id: "ord_fixture",
        expires_at: "2026-01-01T00:00:00.000Z",
        session_token: "fixture-token",
        iframe_url: "https://sandbox.collect.prava.space/fixture",
      }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { createPravaSession } = await import("./server");
    await createPravaSession({ externalOrderRef: "gumroad-gate-fixture" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);

    expect(body.total_amount).toBe("4.89");
    expect(body.currency).toBe("CAD");
    expect(body.purchase_context[0].merchant_details.name).toBe("Gumroad");
    expect(body.purchase_context[0].merchant_details.url).toBe("https://gumroad.com");
    expect(body.purchase_context[0].merchant_details.country_code_iso2).toBe("US");
    expect(body.purchase_context[0].product_details[0].unit_price).toBe("4.89");
    expect(body.purchase_context[0].product_details[0].description).toBe(
      "300+ Meals List WITH RECIPES - A Very Beginner Friendly Cookbook"
    );
    expect(body.external_order_ref).toBe("gumroad-gate-fixture");
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
