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

  it("never writes session_token to the audit log", async () => {
    await appendAuditEvent("test.event", { session_token: "super-secret-jwt", session_id: "sess_1" });
    const raw = await fs.readFile(AUDIT_LOG_PATH, "utf-8");
    expect(raw).not.toContain("super-secret-jwt");
    expect(raw).toContain("sess_1");
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
