import { describe, it, expect } from "vitest";
import { extractPravaErrorCode, categorizeMessage, extractResponseIdSuffix, isKnownSdkCode } from "./diagnostics";
import { suffix6 } from "@/lib/prava/redact";

describe("extractPravaErrorCode", () => {
  it("preserves a documented code verbatim", () => {
    expect(extractPravaErrorCode({ code: "IFRAME_LOAD_ERROR" })).toBe("IFRAME_LOAD_ERROR");
  });

  it("never invents a code — returns UNAVAILABLE when the SDK gives none", () => {
    expect(extractPravaErrorCode({ message: "no code here" })).toBe("UNAVAILABLE");
    expect(extractPravaErrorCode("plain string")).toBe("UNAVAILABLE");
    expect(extractPravaErrorCode(null)).toBe("UNAVAILABLE");
  });
});

describe("categorizeMessage", () => {
  it("categorizes a security-check failure message without echoing it", () => {
    const category = categorizeMessage("We couldn't complete the security check. Please try again.");
    expect(category).toBe("SECURITY_CHECK_FAILED");
  });

  it("categorizes a passkey/WebAuthn-related message", () => {
    expect(categorizeMessage("Passkey verification was cancelled")).toBe("AUTHENTICATION_FAILED");
  });

  it("returns null for a missing message rather than a placeholder that could be confused with data", () => {
    expect(categorizeMessage(undefined)).toBeNull();
    expect(categorizeMessage("")).toBeNull();
  });

  it("falls back to GENERIC_FAILURE for an unrecognized message shape", () => {
    expect(categorizeMessage("some totally unrelated internal glitch")).toBe("GENERIC_FAILURE");
  });
});

describe("extractResponseIdSuffix", () => {
  it("extracts and truncates a responseId found under a recognized key", () => {
    const result = extractResponseIdSuffix({ details: { responseId: "resp_ABCDEF123456" } }, suffix6);
    expect(result).toBe("...123456");
  });

  it("returns null when no recognized id key is present, rather than guessing", () => {
    expect(extractResponseIdSuffix({ details: { unrelated: "value" } }, suffix6)).toBeNull();
    expect(extractResponseIdSuffix({}, suffix6)).toBeNull();
    expect(extractResponseIdSuffix(null, suffix6)).toBeNull();
  });
});

describe("isKnownSdkCode", () => {
  it("recognizes documented client codes", () => {
    expect(isKnownSdkCode("SDK_ALREADY_ACTIVE")).toBe(true);
    expect(isKnownSdkCode("INVALID_CONFIG")).toBe(true);
  });

  it("does not recognize an arbitrary/invented code", () => {
    expect(isKnownSdkCode("MADE_UP_CODE")).toBe(false);
  });
});
