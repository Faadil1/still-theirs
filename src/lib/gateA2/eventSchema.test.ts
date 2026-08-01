import { describe, it, expect } from "vitest";
import { gateA2EventSchema } from "./eventSchema";

describe("gateA2EventSchema", () => {
  it("accepts only whitelisted fields for a known event", () => {
    const result = gateA2EventSchema.safeParse({
      event: "gateA2.session.created",
      sessionIdPresent: true,
      sessionIdSuffix: "...AAAAAA",
      orderIdPresent: true,
      orderIdSuffix: "...BBBBBB",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unrecognized event name", () => {
    const result = gateA2EventSchema.safeParse({ event: "gateA2.not.a.real.event" });
    expect(result.success).toBe(false);
  });

  it("strips (does not fail on, but never carries through) unlisted fields since Zod objects ignore unknown keys by default, and callers only forward parsed.data", () => {
    const result = gateA2EventSchema.safeParse({
      event: "gateA2.flow.error",
      errorCategory: "CARD_NOT_FOUND",
      sessionToken: "should-never-be-forwarded",
      iframeUrl: "https://should-never-be-forwarded.test",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty("sessionToken");
      expect(result.data).not.toHaveProperty("iframeUrl");
    }
  });

  it("rejects overly long sessionIdSuffix values (defense against smuggling full IDs)", () => {
    const result = gateA2EventSchema.safeParse({
      event: "gateA2.session.created",
      sessionIdSuffix: "ses_FULL_ID_THAT_IS_WAY_TOO_LONG_TO_BE_A_SUFFIX",
    });
    expect(result.success).toBe(false);
  });
});
