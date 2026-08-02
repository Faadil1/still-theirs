import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const originalEnv = { ...process.env };

function setLinqEnv() {
  process.env.LINQ_API_KEY = "fixture-linq-api-key-not-real";
  process.env.LINQ_FROM_NUMBER = "+15550000089";
  process.env.LINQ_TRUSTED_CONTACT_NUMBER = "+15550000055";
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe("sendLinqTrustedPerspectiveMessage", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("makes exactly one POST request using `value` (not `text`), with no links, when the config is present", async () => {
    setLinqEnv();
    const fetchMock = mockFetchOnce(201, { id: "chat_ABCDEF123456" });
    vi.stubGlobal("fetch", fetchMock);

    const { sendLinqTrustedPerspectiveMessage } = await import("./server");
    const result = await sendLinqTrustedPerspectiveMessage();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.linqapp.com/api/partner/v3/chats");
    const body = JSON.parse(init.body as string);
    expect(body.message.parts[0].type).toBe("text");
    expect(body.message.parts[0]).toHaveProperty("value");
    expect(body.message.parts[0]).not.toHaveProperty("text");
    expect(body.message.parts[0].value).not.toMatch(/https?:\/\//);
    expect(body.message).toHaveProperty("idempotency_key");

    expect(result.success).toBe(true);
    expect(result.httpStatus).toBe(201);
    expect(result.chatIdPresent).toBe(true);
    expect(result.chatIdSuffix).toBe("...123456");
  });

  it("never includes the API key or phone numbers in the returned result", async () => {
    setLinqEnv();
    vi.stubGlobal("fetch", mockFetchOnce(201, { id: "chat_ABCDEF123456" }));

    const { sendLinqTrustedPerspectiveMessage } = await import("./server");
    const result = await sendLinqTrustedPerspectiveMessage();
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain("fixture-linq-api-key-not-real");
    expect(serialized).not.toContain("+15550000089");
    expect(serialized).not.toContain("+15550000055");
  });

  it("throws a sanitized CONFIG_MISSING error and makes no network call when env vars are absent", async () => {
    delete process.env.LINQ_API_KEY;
    delete process.env.LINQ_FROM_NUMBER;
    delete process.env.LINQ_TRUSTED_CONTACT_NUMBER;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { sendLinqTrustedPerspectiveMessage, LinqApiError } = await import("./server");
    await expect(sendLinqTrustedPerspectiveMessage()).rejects.toMatchObject({
      failureCategory: "CONFIG_MISSING",
    });
    await expect(sendLinqTrustedPerspectiveMessage()).rejects.toBeInstanceOf(LinqApiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a 401 response to AUTH_ERROR without exposing the raw response body", async () => {
    setLinqEnv();
    vi.stubGlobal("fetch", mockFetchOnce(401, { error: "invalid_token", secret_debug: "should-not-appear" }));

    const { sendLinqTrustedPerspectiveMessage } = await import("./server");
    let caught: unknown;
    try {
      await sendLinqTrustedPerspectiveMessage();
    } catch (err) {
      caught = err;
    }
    expect(caught).toMatchObject({ failureCategory: "AUTH_ERROR", httpStatus: 401 });
    expect(JSON.stringify(caught)).not.toContain("should-not-appear");
  });

  it("never retries automatically on failure — exactly one fetch call", async () => {
    setLinqEnv();
    const fetchMock = mockFetchOnce(500, { error: "server_error" });
    vi.stubGlobal("fetch", fetchMock);

    const { sendLinqTrustedPerspectiveMessage } = await import("./server");
    await expect(sendLinqTrustedPerspectiveMessage()).rejects.toMatchObject({ failureCategory: "UPSTREAM_ERROR" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a second concurrent call while one is in flight (single-flight guard), making only one fetch call", async () => {
    setLinqEnv();
    let resolveFetch!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(pending);
    vi.stubGlobal("fetch", fetchMock);

    const { sendLinqTrustedPerspectiveMessage } = await import("./server");
    const first = sendLinqTrustedPerspectiveMessage();
    await expect(sendLinqTrustedPerspectiveMessage()).rejects.toMatchObject({ failureCategory: "ALREADY_IN_PROGRESS" });

    resolveFetch({ ok: true, status: 201, json: async () => ({ id: "chat_ABCDEF123456" }) });
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("LinqTrustedPerspectiveProvider", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("implements the SDK's TrustedPerspectiveProvider interface and never returns a fabricated CONSISTENT/RECOMMEND_PAUSE recommendation", async () => {
    setLinqEnv();
    vi.stubGlobal("fetch", mockFetchOnce(201, { id: "chat_ABCDEF123456" }));

    const { LinqTrustedPerspectiveProvider } = await import("./server");
    const provider = new LinqTrustedPerspectiveProvider();
    const result = await provider.sendPerspectiveRequest({
      decision: "REQUEST_TRUSTED_CONTACT",
      reasonCodes: ["GIFT_CARD_REQUEST"],
      merchantName: "New online contact",
    });

    expect(result.recommendation).toBe("PENDING");
    expect(result.success).toBe(true);
  });

  it("never interpolates merchantName into the outgoing message", async () => {
    setLinqEnv();
    const fetchMock = mockFetchOnce(201, { id: "chat_ABCDEF123456" });
    vi.stubGlobal("fetch", fetchMock);

    const { LinqTrustedPerspectiveProvider } = await import("./server");
    const provider = new LinqTrustedPerspectiveProvider();
    await provider.sendPerspectiveRequest({
      decision: "REQUEST_TRUSTED_CONTACT",
      reasonCodes: ["GIFT_CARD_REQUEST"],
      merchantName: "Extremely Identifiable Merchant Name LLC",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.message.parts[0].value).not.toContain("Extremely Identifiable Merchant Name LLC");
  });
});
