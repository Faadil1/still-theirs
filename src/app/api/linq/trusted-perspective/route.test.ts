import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";

const originalEnv = { ...process.env };

function setLinqEnv() {
  process.env.LINQ_API_KEY = "fixture-linq-api-key-not-real";
  process.env.LINQ_FROM_NUMBER = "+15550000089";
  process.env.LINQ_TRUSTED_CONTACT_NUMBER = "+15550000055";
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/linq/trusted-perspective", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const RISKY_BODY = { decision: "REQUEST_TRUSTED_CONTACT", reasonCodes: ["GIFT_CARD_REQUEST"] };

// Mocked so these tests never touch the real, shared data/audit-log.json
// file (which other test files also read/write concurrently).
const appendAuditEventMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/audit", () => ({
  appendAuditEvent: (...args: unknown[]) => appendAuditEventMock(...args),
}));

describe("POST /api/linq/trusted-perspective", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.unstubAllGlobals();
    appendAuditEventMock.mockClear();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("only exports POST — any other method is rejected by Next.js's router with no handler present", async () => {
    const routeModule = await import("./route");
    expect(typeof routeModule.POST).toBe("function");
    expect((routeModule as Record<string, unknown>).GET).toBeUndefined();
    expect((routeModule as Record<string, unknown>).PUT).toBeUndefined();
    expect((routeModule as Record<string, unknown>).DELETE).toBeUndefined();
  });

  it("rejects a malformed body", async () => {
    const { POST } = await import("./route");
    const badReq = new NextRequest("http://localhost/api/linq/trusted-perspective", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(badReq);
    expect(res.status).toBe(400);
  });

  it("rejects an APPROVE decision — Linq is reachable only from REQUEST_TRUSTED_CONTACT", async () => {
    setLinqEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const res = await POST(makeRequest({ decision: "APPROVE", reasonCodes: [] }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a sanitized configuration error and makes no network call when Linq env vars are missing", async () => {
    delete process.env.LINQ_API_KEY;
    delete process.env.LINQ_FROM_NUMBER;
    delete process.env.LINQ_TRUSTED_CONTACT_NUMBER;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const res = await POST(makeRequest(RISKY_BODY));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.statusCategory).toBe("CONFIG_MISSING");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("on success, returns only the sanitized contract fields — no decision, no session, no raw response", async () => {
    setLinqEnv();
    vi.stubGlobal("fetch", mockFetchOnce(201, { id: "chat_ABCDEF123456" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest(RISKY_BODY));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toEqual({
      success: true,
      provider: "LINQ",
      deliveryRequested: true,
      chatIdSuffix: "...123456",
    });
    expect(body).not.toHaveProperty("decision");
    expect(body).not.toHaveProperty("sessionId");
    expect(body).not.toHaveProperty("sessionToken");
  });

  it("never leaks the API key or phone numbers in the HTTP response", async () => {
    setLinqEnv();
    vi.stubGlobal("fetch", mockFetchOnce(201, { id: "chat_ABCDEF123456" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest(RISKY_BODY));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("fixture-linq-api-key-not-real");
    expect(raw).not.toContain("+15550000089");
    expect(raw).not.toContain("+15550000055");
  });

  it("exactly one outgoing Linq request per explicit POST", async () => {
    setLinqEnv();
    const fetchMock = mockFetchOnce(201, { id: "chat_ABCDEF123456" });
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    await POST(makeRequest(RISKY_BODY));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a rapid second request while one is in flight is rejected (double-click protection), never producing two Linq calls", async () => {
    setLinqEnv();
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const first = POST(makeRequest(RISKY_BODY));
    const second = await POST(makeRequest(RISKY_BODY));
    expect(second.status).toBe(429);

    resolveFetch({ ok: true, status: 201, json: async () => ({ id: "chat_ABCDEF123456" }) });
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("audit log records only sanitized fields — never the API key, full phone number, or full chat id", async () => {
    setLinqEnv();
    vi.stubGlobal("fetch", mockFetchOnce(201, { id: "chat_ABCDEF123456" }));

    const { POST } = await import("./route");
    await POST(makeRequest(RISKY_BODY));

    expect(appendAuditEventMock).toHaveBeenCalledWith("linq.perspective.sent", expect.any(Object));
    const serializedCalls = JSON.stringify(appendAuditEventMock.mock.calls);
    expect(serializedCalls).not.toContain("fixture-linq-api-key-not-real");
    expect(serializedCalls).not.toContain("+15550000089");
    expect(serializedCalls).not.toContain("+15550000055");
    expect(serializedCalls).not.toContain("chat_ABCDEF123456");
  });

  it("a Linq failure is reported without ever creating a Prava session or altering any decision", async () => {
    setLinqEnv();
    vi.stubGlobal("fetch", mockFetchOnce(401, { error: "invalid_token" }));

    const { POST } = await import("./route");
    const res = await POST(makeRequest(RISKY_BODY));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.statusCategory).toBe("AUTH_ERROR");
    expect(body).not.toHaveProperty("decision");

    const serializedCalls = JSON.stringify(appendAuditEventMock.mock.calls);
    expect(serializedCalls).not.toContain("prava.session.created");
  });

  it("the route module never imports PravaSDK, createPravaSession, or references /api/prava/session", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src/app/api/linq/trusted-perspective/route.ts"), "utf-8");
    expect(source).not.toMatch(/PravaSDK/);
    expect(source).not.toMatch(/createPravaSession/);
    expect(source).not.toMatch(/\/api\/prava\/session/);
    expect(source).not.toMatch(/collectPAN/);
  });
});
