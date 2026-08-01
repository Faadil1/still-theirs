import { describe, it, expect } from "vitest";
import { healthResponseSchema, createSessionResponseSchema } from "./schemas";

describe("healthResponseSchema", () => {
  it("validates a well-formed health response", () => {
    const result = healthResponseSchema.safeParse({ status: "ok", timestamp: "2026-08-01T00:00:00Z" });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing timestamp", () => {
    const result = healthResponseSchema.safeParse({ status: "ok" });
    expect(result.success).toBe(false);
  });
});

describe("createSessionResponseSchema", () => {
  it("validates a well-formed session response", () => {
    const result = createSessionResponseSchema.safeParse({
      session_id: "sess_1",
      session_token: "jwt",
      iframe_url: "https://sandbox.collect.prava.space/x",
      order_id: "order_1",
      expires_at: "2026-08-01T00:15:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response missing session_token", () => {
    const result = createSessionResponseSchema.safeParse({
      session_id: "sess_1",
      iframe_url: "https://sandbox.collect.prava.space/x",
      order_id: "order_1",
      expires_at: "2026-08-01T00:15:00Z",
    });
    expect(result.success).toBe(false);
  });
});
