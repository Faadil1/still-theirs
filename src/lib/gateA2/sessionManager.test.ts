import { describe, it, expect, vi } from "vitest";
import { GateA2Controller, categorizeError, categorizeHttpFailure } from "./sessionManager";

const FIXTURE_SESSION = {
  sessionId: "ses_FIXTUREONLY0000000AAAAAA",
  orderId: "ord_FIXTUREONLY0000000BBBBBB",
  expiresAt: "2026-08-01T16:35:10.000Z",
  sessionToken: "eyJhbGciOiJIUzI1NiJ9.fixture.fixture",
  iframeUrl: "https://sandbox.collect.prava.space?session=ses_FIXTUREONLY0000000AAAAAA",
};

function mockFetchSession() {
  return async () => ({
    ok: true,
    status: 200,
    json: async () => FIXTURE_SESSION,
  });
}

describe("GateA2Controller", () => {
  it("starts IDLE with no session created on construction (no page-load session creation)", () => {
    const controller = new GateA2Controller();
    expect(controller.getPublicState().status).toBe("IDLE");
    expect(controller.getSessionForSdk()).toBeNull();
  });

  it("one call to startSession results in exactly one fetch", async () => {
    const fetchSession = vi.fn(mockFetchSession());
    const controller = new GateA2Controller();
    await controller.startSession(fetchSession);
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(controller.getPublicState().status).toBe("READY_FOR_CARD");
  });

  it("concurrent/duplicate calls while creating cannot create duplicate sessions", async () => {
    let resolveFetch: (() => void) | null = null;
    const fetchSession = vi.fn(
      () =>
        new Promise<{ ok: boolean; status: number; json: () => Promise<typeof FIXTURE_SESSION> }>((resolve) => {
          resolveFetch = () => resolve({ ok: true, status: 200, json: async () => FIXTURE_SESSION });
        })
    );

    const controller = new GateA2Controller();
    const p1 = controller.startSession(fetchSession);
    const p2 = controller.startSession(fetchSession);
    const p3 = controller.startSession(fetchSession);

    expect(fetchSession).toHaveBeenCalledTimes(1);
    resolveFetch!();
    await Promise.all([p1, p2, p3]);
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it("session token and iframe URL are only reachable via getSessionForSdk, never via getPublicState", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());

    const publicState = controller.getPublicState();
    const serializedPublic = JSON.stringify(publicState);
    expect(serializedPublic).not.toContain(FIXTURE_SESSION.sessionToken);
    expect(serializedPublic).not.toContain(FIXTURE_SESSION.iframeUrl);
    expect(serializedPublic).not.toContain(FIXTURE_SESSION.sessionId);
    expect(serializedPublic).not.toContain(FIXTURE_SESSION.orderId);

    const sdkSession = controller.getSessionForSdk();
    expect(sdkSession?.sessionToken).toBe(FIXTURE_SESSION.sessionToken);
    expect(sdkSession?.iframeUrl).toBe(FIXTURE_SESSION.iframeUrl);
  });

  it("public state truncates identifiers to a six-character suffix", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    const state = controller.getPublicState();
    expect(state.sessionIdSuffix).toBe("...AAAAAA");
    expect(state.orderIdSuffix).toBe("...BBBBBB");
  });

  it("cancel() clears all transient session state", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    expect(controller.getSessionForSdk()).not.toBeNull();

    controller.cancel();
    expect(controller.getPublicState().status).toBe("CANCELLED");
    expect(controller.getSessionForSdk()).toBeNull();
    expect(controller.getPublicState().sessionIdPresent).toBe(false);
  });

  it("expire() clears all transient session state", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    expect(controller.getSessionForSdk()).not.toBeNull();

    controller.expire();
    expect(controller.getPublicState().status).toBe("SAFE_ERROR");
    expect(controller.getPublicState().errorCategory).toBe("SESSION_EXPIRED");
    expect(controller.getSessionForSdk()).toBeNull();
  });

  it("complete() clears session state after a successful flow", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.complete();
    expect(controller.getPublicState().status).toBe("COMPLETED");
    expect(controller.getSessionForSdk()).toBeNull();
  });

  it("does not start a new session while one is already READY_FOR_CARD", async () => {
    const fetchSession = vi.fn(mockFetchSession());
    const controller = new GateA2Controller();
    await controller.startSession(fetchSession);
    await controller.startSession(fetchSession);
    expect(fetchSession).toHaveBeenCalledTimes(1);
  });

  it("categorizeError never echoes the raw error object, only a category string", () => {
    const rawError = { code: "CARD_NOT_FOUND", message: "raw-detail-that-must-not-leak", details: { pan: "4111111111111111" } };
    const category = categorizeError(rawError);
    expect(category).toBe("CARD_NOT_FOUND");
    expect(category).not.toContain("raw-detail-that-must-not-leak");
    expect(category).not.toContain("4111111111111111");
  });

  it("categorizeError falls back to UNKNOWN_ERROR for unrecognized shapes", () => {
    expect(categorizeError("some raw string that should not be echoed")).toBe("UNKNOWN_ERROR");
    expect(categorizeError(null)).toBe("UNKNOWN_ERROR");
  });

  it("categorizeHttpFailure classifies without echoing raw text", () => {
    expect(categorizeHttpFailure(0, null)).toBe("NETWORK_OR_TIMEOUT");
    expect(categorizeHttpFailure(401, { error: "unauthorized" })).toBe("AUTH_ERROR");
    expect(
      categorizeHttpFailure(500, { error: "Missing or invalid server environment variables: X" })
    ).toBe("ENV_MISCONFIGURED");
  });

  it("fail() clears session state and records only a sanitized category", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.fail({ code: "TRIES_EXHAUSTED", message: "raw-should-not-leak" });
    const state = controller.getPublicState();
    expect(state.status).toBe("SAFE_ERROR");
    expect(state.errorCategory).toBe("TRIES_EXHAUSTED");
    expect(JSON.stringify(state)).not.toContain("raw-should-not-leak");
    expect(controller.getSessionForSdk()).toBeNull();
  });

  it("onError path preserves the exact SDK error code and marks onErrorObserved (not promiseRejected)", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.fail({ code: "SDK_INIT_ERROR", message: "raw-should-not-leak" }, "onError");
    const state = controller.getPublicState();
    expect(state.pravaErrorCode).toBe("SDK_INIT_ERROR");
    expect(state.onErrorObserved).toBe(true);
    expect(state.promiseRejected).toBe(false);
  });

  it("promiseRejection path is captured distinctly from onError", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.fail(new Error("raw-should-not-leak"), "promiseRejection");
    const state = controller.getPublicState();
    expect(state.promiseRejected).toBe(true);
    expect(state.onErrorObserved).toBe(false);
    expect(state.pravaErrorCode).toBe("UNAVAILABLE");
    expect(JSON.stringify(state)).not.toContain("raw-should-not-leak");
  });

  it("sdkInit failure source resets stage to SDK_INITIALIZATION", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    expect(controller.getPublicState().stage).toBe("IFRAME_LOADING");
    controller.fail({ code: "INVALID_CONFIG" }, "sdkInit");
    expect(controller.getPublicState().stage).toBe("SDK_INITIALIZATION");
  });

  it("dismiss() categorizes the reason safely and marks onDismissObserved, never echoing raw reason text", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.dismiss("User closed the security check modal early");
    const state = controller.getPublicState();
    expect(state.status).toBe("CANCELLED");
    expect(state.onDismissObserved).toBe(true);
    expect(state.sanitizedMessageCategory).toBe("SECURITY_CHECK_FAILED");
    expect(JSON.stringify(state)).not.toContain("User closed the security check modal early");
  });

  it("does not invent a pravaErrorCode when the SDK provides none — uses the UNAVAILABLE sentinel", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.fail("a plain string with no code", "onError");
    expect(controller.getPublicState().pravaErrorCode).toBe("UNAVAILABLE");
  });

  it("stage progresses through milestones and a later generic message never overwrites a more precise stage bucket already set by markCardValidationComplete", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.markIframeReady();
    expect(controller.getPublicState().stage).toBe("CARD_VALIDATION");
    controller.markCardValidationComplete();
    expect(controller.getPublicState().stage).toBe("SECURITY_CHECK");
    // A subsequent onError must not regress the stage — it only records
    // diagnostics at the stage already reached.
    controller.fail({ code: "SECURITY_CHECK_FAILED" }, "onError");
    expect(controller.getPublicState().stage).toBe("SECURITY_CHECK");
  });

  it("raw details (e.g. a PAN-like value) are never present anywhere in getPublicState()", async () => {
    const controller = new GateA2Controller();
    await controller.startSession(mockFetchSession());
    controller.fail(
      { code: "CARD_INACTIVE", message: "raw-msg", details: { pan: "4111111111111111", cvv: "123" } },
      "onError"
    );
    const serialized = JSON.stringify(controller.getPublicState());
    expect(serialized).not.toContain("4111111111111111");
    expect(serialized).not.toContain("123");
    expect(serialized).not.toContain("raw-msg");
  });
});
