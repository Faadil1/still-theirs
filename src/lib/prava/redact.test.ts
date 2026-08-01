import { describe, it, expect } from "vitest";
import { redact, suffix6 } from "./redact";

describe("redact", () => {
  it("redacts session_token (snake_case)", () => {
    const result = redact({ session_token: "abc123" }) as Record<string, unknown>;
    expect(result.session_token).toBe("[REDACTED]");
  });

  it("redacts sessionToken (camelCase)", () => {
    const result = redact({ sessionToken: "abc123" }) as Record<string, unknown>;
    expect(result.sessionToken).toBe("[REDACTED]");
  });

  it("never emits iframe_url or iframeUrl", () => {
    const input = {
      iframe_url: "https://sandbox.collect.prava.space?session=abc",
      iframeUrl: "https://sandbox.collect.prava.space?session=abc",
    };
    const result = redact(input) as Record<string, unknown>;
    expect(result.iframe_url).toBe("[REDACTED]");
    expect(result.iframeUrl).toBe("[REDACTED]");
  });

  it("redacts Authorization headers", () => {
    const result = redact({ Authorization: "Bearer sk_test_x", authorization: "Bearer sk_test_x" }) as Record<string, unknown>;
    expect(result.Authorization).toBe("[REDACTED]");
    expect(result.authorization).toBe("[REDACTED]");
  });

  it("redacts URLs with embedded query-string tokens even under an unrecognized key", () => {
    const result = redact({ someUrl: "https://example.com/callback?session=abc123&sig=xyz" }) as Record<string, unknown>;
    expect(result.someUrl).toBe("[REDACTED_URL]");
  });

  it("redacts URLs containing a JWT-like embedded token even under an unrecognized key", () => {
    const jwtLike = "https://example.com/path/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const result = redact({ someUrl: jwtLike }) as Record<string, unknown>;
    expect(result.someUrl).toBe("[REDACTED_URL]");
  });

  it("does not redact plain URLs without query strings or embedded tokens", () => {
    const result = redact({ merchant_url: "https://example.com" }) as Record<string, unknown>;
    expect(result.merchant_url).toBe("https://example.com");
  });

  it("truncates session_id and order_id to a six-character suffix instead of fully redacting", () => {
    const result = redact({
      session_id: "ses_FIXTUREONLY0000000AAAAAA",
      order_id: "ord_FIXTUREONLY0000000BBBBBB",
      sessionId: "ses_FIXTUREONLY0000000AAAAAA",
      orderId: "ord_FIXTUREONLY0000000BBBBBB",
    }) as Record<string, unknown>;
    expect(result.session_id).toBe("...AAAAAA");
    expect(result.order_id).toBe("...BBBBBB");
    expect(result.sessionId).toBe("...AAAAAA");
    expect(result.orderId).toBe("...BBBBBB");
    expect(result.session_id).not.toContain("ses_FIXTUREONLY0000000AAAAAA");
  });

  it("redacts token, dynamic_cvv, card, cvv, otp, passkey, assertion, api_key from nested objects", () => {
    const input = {
      line_items: [
        {
          txn_ref_id: "ref_1",
          token: "4111111111111111",
          dynamic_cvv: "999",
          card: "4111111111111111",
          cvv: "123",
          otp: "456789",
          passkey: { assertion: "base64assertiondata" },
          api_key: "sk_test_x",
        },
      ],
    };
    const result = redact(input) as { line_items: Array<Record<string, unknown>> };
    const item = result.line_items[0];
    expect(item.token).toBe("[REDACTED]");
    expect(item.dynamic_cvv).toBe("[REDACTED]");
    expect(item.card).toBe("[REDACTED]");
    expect(item.cvv).toBe("[REDACTED]");
    expect(item.otp).toBe("[REDACTED]");
    expect(item.passkey).toBe("[REDACTED]");
    expect(item.api_key).toBe("[REDACTED]");
    expect(item.txn_ref_id).toBe("ref_1");
  });

  it("does not mutate the original input object", () => {
    const input = { session_token: "abc123", nested: { iframe_url: "https://x.test?a=1" } };
    const snapshotBefore = JSON.parse(JSON.stringify(input));
    redact(input);
    expect(input).toEqual(snapshotBefore);
  });
});

describe("suffix6", () => {
  it("returns only the last six characters, prefixed", () => {
    expect(suffix6("ses_FIXTUREONLY0000000AAAAAA")).toBe("...AAAAAA");
  });

  it("returns null for null/undefined input", () => {
    expect(suffix6(null)).toBeNull();
    expect(suffix6(undefined)).toBeNull();
  });
});
