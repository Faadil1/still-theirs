import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("getServerEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PRAVA_SECRET_KEY;
    delete process.env.PRAVA_BASE_URL;
    delete process.env.PRAVA_TEST_USER_EMAIL;
    delete process.env.PRAVA_TEST_USER_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("throws a clear error when PRAVA_SECRET_KEY is missing", async () => {
    process.env.PRAVA_BASE_URL = "https://sandbox.api.prava.space";
    process.env.PRAVA_TEST_USER_EMAIL = "test@example.com";
    process.env.PRAVA_TEST_USER_ID = "still-theirs-demo-001";

    const { getServerEnv } = await import("./env");
    expect(() => getServerEnv()).toThrow(/PRAVA_SECRET_KEY/);
  });

  it("throws a clear error when publishable key is missing", async () => {
    delete process.env.NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY;
    const { getClientEnv } = await import("./env");
    expect(() => getClientEnv()).toThrow(/NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY/);
  });
});

describe("getHealthEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PRAVA_BASE_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("only requires PRAVA_BASE_URL, not the secret key or test user vars", async () => {
    process.env.PRAVA_BASE_URL = "https://sandbox.api.prava.space";
    delete process.env.PRAVA_SECRET_KEY;
    delete process.env.PRAVA_TEST_USER_EMAIL;
    delete process.env.PRAVA_TEST_USER_ID;

    const { getHealthEnv } = await import("./env");
    expect(() => getHealthEnv()).not.toThrow();
  });

  it("throws a clear error when PRAVA_BASE_URL is missing", async () => {
    const { getHealthEnv } = await import("./env");
    expect(() => getHealthEnv()).toThrow(/PRAVA_BASE_URL/);
  });
});

describe("parseOpenAITimeoutMs", () => {
  it("defaults to 30000ms when unset", async () => {
    const { parseOpenAITimeoutMs, OPENAI_TIMEOUT_MS_DEFAULT } = await import("./env");
    expect(parseOpenAITimeoutMs(undefined)).toBe(30000);
    expect(OPENAI_TIMEOUT_MS_DEFAULT).toBe(30000);
  });

  it("accepts a valid override within the allowed range", async () => {
    const { parseOpenAITimeoutMs } = await import("./env");
    expect(parseOpenAITimeoutMs("45000")).toBe(45000);
  });

  it("safely falls back to the default for non-numeric, zero, or negative values", async () => {
    const { parseOpenAITimeoutMs } = await import("./env");
    expect(parseOpenAITimeoutMs("not-a-number")).toBe(30000);
    expect(parseOpenAITimeoutMs("0")).toBe(30000);
    expect(parseOpenAITimeoutMs("-5000")).toBe(30000);
    expect(parseOpenAITimeoutMs("12.5")).toBe(30000);
  });

  it("safely falls back to the default for values outside the 5000-60000 range", async () => {
    const { parseOpenAITimeoutMs } = await import("./env");
    expect(parseOpenAITimeoutMs("1000")).toBe(30000);
    expect(parseOpenAITimeoutMs("120000")).toBe(30000);
  });

  it("accepts the documented boundary values", async () => {
    const { parseOpenAITimeoutMs } = await import("./env");
    expect(parseOpenAITimeoutMs("5000")).toBe(5000);
    expect(parseOpenAITimeoutMs("60000")).toBe(60000);
  });
});

describe("getOpenAIEnv", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("includes OPENAI_TIMEOUT_MS in its result, defaulting to 30000", async () => {
    process.env.OPENAI_API_KEY = "sk-fixture-only-not-real";
    process.env.OPENAI_MODEL = "gpt-fixture-model";
    delete process.env.OPENAI_TIMEOUT_MS;

    const { getOpenAIEnv } = await import("./env");
    expect(getOpenAIEnv().OPENAI_TIMEOUT_MS).toBe(30000);
  });

  it("OPENAI_TIMEOUT_MS is never exposed via a NEXT_PUBLIC_ prefixed variable", async () => {
    const source = await import("fs").then((fs) => fs.promises.readFile("src/lib/env.ts", "utf-8"));
    expect(source).not.toMatch(/NEXT_PUBLIC_OPENAI_TIMEOUT/);
  });
});
