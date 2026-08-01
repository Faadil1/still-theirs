import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { POST } from "./route";

const AUDIT_LOG_PATH = path.join(process.cwd(), "data", "audit-log.json");

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/prava/gate-a2-event", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/prava/gate-a2-event", () => {
  let originalContent: string;

  beforeEach(async () => {
    originalContent = await fs.readFile(AUDIT_LOG_PATH, "utf-8").catch(() => "[]");
  });

  afterEach(async () => {
    await fs.writeFile(AUDIT_LOG_PATH, originalContent, "utf-8");
  });

  it("records only whitelisted fields, dropping any smuggled sensitive fields", async () => {
    const res = await POST(
      makeRequest({
        event: "gateA2.session.created",
        sessionIdPresent: true,
        sessionIdSuffix: "...AAAAAA",
        sessionToken: "should-never-appear",
        iframeUrl: "https://should-never-appear.test",
      })
    );
    expect(res.status).toBe(200);

    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).not.toContain("should-never-appear");
    expect(raw).toContain("...AAAAAA");

    const parsed = JSON.parse(raw);
    const last = parsed[parsed.length - 1];
    const allowedKeys = [
      "sessionIdPresent",
      "sessionIdSuffix",
      "orderIdPresent",
      "orderIdSuffix",
      "sdkInitialized",
      "collectionOpened",
      "authenticationRequested",
      "flowCompleted",
      "cancelled",
      "errorCategory",
    ];
    for (const key of Object.keys(last.detail)) {
      expect(allowedKeys).toContain(key);
    }
  });

  it("records diagnostic fields (stage, pravaErrorCode, etc.) while stripping any smuggled raw error object", async () => {
    const res = await POST(
      makeRequest({
        event: "gateA2.flow.error",
        stage: "SECURITY_CHECK",
        pravaErrorCode: "SECURITY_CHECK_FAILED",
        sanitizedMessageCategory: "SECURITY_CHECK_FAILED",
        onErrorObserved: true,
        promiseRejected: false,
        onDismissObserved: false,
        passkeyPromptObserved: false,
        responseIdSuffix: "...ABC123",
        rawSdkErrorObject: { message: "should-never-appear", details: { pan: "4111111111111111" } },
      })
    );
    expect(res.status).toBe(200);

    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).not.toContain("should-never-appear");
    expect(raw).not.toContain("4111111111111111");
    expect(raw).toContain("SECURITY_CHECK");
    expect(raw).toContain("SECURITY_CHECK_FAILED");

    const parsed = JSON.parse(raw);
    const last = parsed[parsed.length - 1];
    expect(last.detail).not.toHaveProperty("rawSdkErrorObject");
  });

  it("rejects an event name outside the whitelist", async () => {
    const res = await POST(makeRequest({ event: "gateA2.totally.made.up" }));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed (non-JSON) body without throwing", async () => {
    const badReq = new NextRequest("http://localhost/api/prava/gate-a2-event", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });
});
