import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { ROUTINE_GROCERIES_INTENT, URGENT_GIFT_CARDS_INTENT } from "@/lib/risk/scenarios";

const AUDIT_LOG_PATH = path.join(process.cwd(), "data", "audit-log.json");

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/risk/analyze", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/risk/analyze", () => {
  let originalContent: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(async () => {
    originalContent = await fs.readFile(AUDIT_LOG_PATH, "utf-8").catch(() => "[]");
    originalEnv = { ...process.env };
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
    vi.resetModules();
  });

  afterEach(async () => {
    await fs.writeFile(AUDIT_LOG_PATH, originalContent, "utf-8");
    process.env = originalEnv;
  });

  it("routine groceries: returns APPROVE and never creates a Prava session", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest(ROUTINE_GROCERIES_INTENT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision).toBe("APPROVE");
    expect(body.proof.pravaSessionCreated).toBe(false);
    expect(body.proof.paymentCredentialCreated).toBe(false);
    expect(body.explanation.source).toBe("DETERMINISTIC_FALLBACK"); // no OpenAI key in this test env
  });

  it("urgent gift cards: returns REQUEST_TRUSTED_CONTACT with no Prava session or credential", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest(URGENT_GIFT_CARDS_INTENT));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision).toBe("REQUEST_TRUSTED_CONTACT");
    expect(body.safeToCreatePravaSession).toBe(false);
    expect(body.credentialCreationAllowed).toBe(false);
    expect(body.proof.pravaSessionCreated).toBe(false);
    expect(body.proof.paymentCredentialCreated).toBe(false);
  });

  it("rejects a malformed body", async () => {
    const { POST } = await import("./route");
    const badReq = new NextRequest("http://localhost/api/risk/analyze", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("rejects an intent missing required sanitized fields", async () => {
    const { POST } = await import("./route");
    const res = await POST(makeRequest({ scenarioId: "incomplete" }));
    expect(res.status).toBe(400);
  });

  it("audit log records only sanitized fields — never userStatement or raw prompt/response text", async () => {
    const { POST } = await import("./route");
    await POST(makeRequest(URGENT_GIFT_CARDS_INTENT));
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).not.toContain(URGENT_GIFT_CARDS_INTENT.userStatement);
    expect(raw).toContain("risk.intent.received");
    expect(raw).toContain("risk.rules.completed");
    expect(raw).toContain("risk.prava.not_created");
  });

  it("second concurrent request is rejected while one is in flight (single-flight guard)", async () => {
    const { POST } = await import("./route");
    const p1 = POST(makeRequest(ROUTINE_GROCERIES_INTENT));
    const res2 = await POST(makeRequest(ROUTINE_GROCERIES_INTENT));
    expect(res2.status).toBe(429);
    await p1;
  });
});
