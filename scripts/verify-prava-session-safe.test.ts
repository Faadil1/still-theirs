import { describe, it, expect } from "vitest";
import { suffix6, categorizeError, sanitizeBody } from "./verify-prava-session-safe.mjs";

describe("verify-prava-session-safe sanitizer (fixtures only, no live calls)", () => {
  it("sanitizeBody never includes sessionToken or iframeUrl even if present in the fixture", () => {
    const fixture = {
      sessionId: "ses_FIXTUREONLY0000000AAAAAA",
      sessionToken: "eyJhbGciOiJIUzI1NiJ9.fixture.fixture",
      iframeUrl: "https://sandbox.collect.prava.space?session=ses_FIXTUREONLY0000000AAAAAA",
      orderId: "ord_FIXTUREONLY0000000BBBBBB",
      expiresAt: "2026-08-01T15:35:10.854Z",
      sessionTokenPresent: true,
      iframeUrlPresent: true,
    };

    const sanitized = sanitizeBody(fixture);
    const serialized = JSON.stringify(sanitized);

    expect(serialized).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(serialized).not.toContain("sandbox.collect.prava.space");
    expect(serialized).not.toContain(fixture.sessionId);
    expect(serialized).not.toContain(fixture.orderId);
    expect(sanitized.sessionIdSuffix).toBe("...AAAAAA");
    expect(sanitized.orderIdSuffix).toBe("...BBBBBB");
    expect(sanitized.sessionTokenPresent).toBe(true);
    expect(sanitized.iframeUrlPresent).toBe(true);
  });

  it("suffix6 returns null for missing values and a 6-char suffix otherwise", () => {
    expect(suffix6(undefined)).toBeNull();
    expect(suffix6("")).toBeNull();
    expect(suffix6("ses_FIXTUREONLY0000000AAAAAA")).toBe("...AAAAAA");
  });

  it("categorizeError classifies a missing-env-var fixture without echoing raw text", () => {
    const category = categorizeError(500, { error: "Missing or invalid server environment variables: PRAVA_TEST_USER_EMAIL" });
    expect(category).toBe("ENV_MISCONFIGURED");
  });

  it("categorizeError classifies network failure (status 0) fixture", () => {
    expect(categorizeError(0, null)).toBe("NETWORK_OR_TIMEOUT");
  });

  it("categorizeError classifies an auth error fixture", () => {
    expect(categorizeError(401, { error: "Unauthorized" })).toBe("AUTH_ERROR");
  });
});
