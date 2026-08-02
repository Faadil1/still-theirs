import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import { appendAuditEvent } from "./audit";

const AUDIT_LOG_PATH = path.join(process.cwd(), "data", "audit-log.json");

describe("appendAuditEvent", () => {
  let originalContent: string;

  beforeEach(async () => {
    originalContent = await fs.readFile(AUDIT_LOG_PATH, "utf-8").catch(() => "[]");
  });

  afterEach(async () => {
    await fs.writeFile(AUDIT_LOG_PATH, originalContent, "utf-8");
  });

  it("never writes session_token to the audit log, and truncates the session_id", async () => {
    await appendAuditEvent("test.event", { session_token: "super-secret-jwt", session_id: "ses_FIXTUREONLY0000000AAAAAA" });
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).not.toContain("super-secret-jwt");
    expect(raw).not.toContain("ses_FIXTUREONLY0000000AAAAAA");
    expect(raw).toContain("...AAAAAA");
  });

  it("never writes iframe_url to the audit log", async () => {
    await appendAuditEvent("test.event", { iframe_url: "https://sandbox.collect.prava.space?session=abc123" });
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).not.toContain("sandbox.collect.prava.space");
    expect(raw).not.toContain("session=abc123");
  });

  it("preserves the actual observed HTTP status rather than a hard-coded value", async () => {
    await appendAuditEvent("test.event", { httpStatus: 200 });
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const last = parsed[parsed.length - 1];
    expect(last.detail.httpStatus).toBe(200);
  });

  it("never writes payment token to the audit log", async () => {
    await appendAuditEvent("test.event", { token: "4111111111111111" });
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).not.toContain("4111111111111111");
  });

  it("never writes dynamic_cvv to the audit log", async () => {
    await appendAuditEvent("test.event", { dynamic_cvv: "999" });
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const last = parsed[parsed.length - 1];
    expect(last.detail.dynamic_cvv).toBe("[REDACTED]");
  });

  it("serializes concurrent writes so two near-simultaneous events are never lost (regression for the missing gateA2.sdk.initialized event)", async () => {
    await fs.writeFile(AUDIT_LOG_PATH, "[]", "utf-8");

    await Promise.all([
      appendAuditEvent("event.one", { marker: "one" }),
      appendAuditEvent("event.two", { marker: "two" }),
      appendAuditEvent("event.three", { marker: "three" }),
    ]);

    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    const markers = parsed.map((e: { detail: { marker: string } }) => e.detail.marker);
    expect(markers.sort()).toEqual(["one", "three", "two"]);
  });

  it("a filesystem write failure never rejects appendAuditEvent (must never interrupt the caller's flow)", async () => {
    const writeSpy = vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("disk full"));

    await expect(appendAuditEvent("test.event", { marker: "should-not-throw" })).resolves.toBeUndefined();

    writeSpy.mockRestore();
  });

  it("a read failure (e.g. corrupted or unreadable existing file) never rejects appendAuditEvent", async () => {
    const readSpy = vi.spyOn(fs, "readFile").mockRejectedValue(new Error("permission denied"));
    const writeSpy = vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("permission denied"));

    await expect(appendAuditEvent("test.event", { marker: "should-not-throw" })).resolves.toBeUndefined();

    readSpy.mockRestore();
    writeSpy.mockRestore();
  });

  it("a later write still succeeds after a prior write failure (the queue is not permanently blocked)", async () => {
    const writeSpy = vi.spyOn(fs, "writeFile").mockRejectedValueOnce(new Error("transient failure"));

    await appendAuditEvent("test.event.fails", { marker: "first" });
    writeSpy.mockRestore();
    await appendAuditEvent("test.event.succeeds", { marker: "second" });

    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).toContain("test.event.succeeds");
  });
});

describe("appendAuditEvent in production", () => {
  let originalContent: string;

  beforeEach(async () => {
    originalContent = await fs.readFile(AUDIT_LOG_PATH, "utf-8").catch(() => "[]");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await fs.writeFile(AUDIT_LOG_PATH, originalContent, "utf-8");
  });

  it("never writes to the project filesystem in production — emits the redacted event via console.info instead", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    await appendAuditEvent("test.event", { session_token: "super-secret-jwt", httpStatus: 201 });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const logged = infoSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain("super-secret-jwt");
    expect(logged).toContain("test.event");
    expect(logged).toContain("201");

    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).toBe(originalContent);

    infoSpy.mockRestore();
  });

  it("always resolves in production even if console.info itself throws", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {
      throw new Error("stdout closed");
    });

    await expect(appendAuditEvent("test.event", { marker: "value" })).resolves.toBeUndefined();

    infoSpy.mockRestore();
  });
});
