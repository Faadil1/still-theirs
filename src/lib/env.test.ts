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
    process.env.PRAVA_TEST_USER_ID = "elder-demo-001";

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
