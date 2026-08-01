import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
});
