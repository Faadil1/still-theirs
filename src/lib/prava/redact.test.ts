import { describe, it, expect } from "vitest";
import { redact } from "./redact";

describe("redact", () => {
  it("redacts session_token", () => {
    const result = redact({ session_token: "abc123", session_id: "sess_1" }) as Record<string, unknown>;
    expect(result.session_token).toBe("[REDACTED]");
    expect(result.session_id).toBe("sess_1");
  });

  it("redacts token and dynamic_cvv from nested line items", () => {
    const input = {
      line_items: [{ txn_ref_id: "ref_1", token: "4111111111111111", dynamic_cvv: "999" }],
    };
    const result = redact(input) as { line_items: Array<Record<string, unknown>> };
    expect(result.line_items[0].token).toBe("[REDACTED]");
    expect(result.line_items[0].dynamic_cvv).toBe("[REDACTED]");
    expect(result.line_items[0].txn_ref_id).toBe("ref_1");
  });

  it("redacts secret keys and authorization headers", () => {
    const result = redact({ PRAVA_SECRET_KEY: "sk_test_x", Authorization: "Bearer sk_test_x" }) as Record<string, unknown>;
    expect(result.PRAVA_SECRET_KEY).toBe("[REDACTED]");
    expect(result.Authorization).toBe("[REDACTED]");
  });
});
