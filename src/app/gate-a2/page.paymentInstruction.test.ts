import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "gate-a2", "page.tsx");

describe("Gate A2 page — Visa Intelligent Commerce approved-payment-instruction context (source=demo only)", () => {
  it("shows the approved payment instruction card only when sourceParam === \"demo\"", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const panelStart = source.indexOf('sourceParam === "demo" && (');
    expect(panelStart).toBeGreaterThan(-1);
    const panel = source.slice(panelStart, source.indexOf("Sandbox only", panelStart));

    expect(panel).toContain("Approved payment instruction");
    expect(panel).toContain("Routine digital purchase");
    expect(panel).toMatch(/<dt>Merchant<\/dt>/);
    expect(panel).toMatch(/<dt>Maximum amount<\/dt>/);
    expect(panel).toMatch(/<dt>Purpose<\/dt>/);
    expect(panel).toMatch(/<dt>Credential scope<\/dt>/);
    expect(panel).toContain("One purchase only");
    expect(panel).toContain("Digital cookbook");
    expect(panel).toContain("Still Theirs approved the purchase intent.");
    expect(panel).toContain("No Prava session exists until you create it below.");
  });

  it("includes the Visa Intelligent Commerce and sandbox-only disclosures", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).toContain("Visa Intelligent Commerce-enabled through Prava.");
    expect(source).toContain("Sandbox only — no real charge.");
  });

  it("sources merchant and amount from the shared ROUTINE_GROCERIES_INTENT scenario rather than duplicating literal values", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).toMatch(/import \{ ROUTINE_GROCERIES_INTENT \} from "@\/lib\/risk\/scenarios";/);

    const panelStart = source.indexOf('sourceParam === "demo" && (');
    const panelEnd = source.indexOf("Sandbox only", panelStart);
    const panel = source.slice(panelStart, panelEnd);

    expect(panel).toContain("{ROUTINE_GROCERIES_INTENT.merchantLabel}");
    expect(panel).toContain("formatAmount(ROUTINE_GROCERIES_INTENT.amountCents, ROUTINE_GROCERIES_INTENT.currency)");
    expect(panel).not.toMatch(/\$\d/);
  });

  it("never claims a credential has been created — no success card is derived from the local COMPLETED state", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/[Cc]redential (was |has been )?created/);
    expect(source).not.toMatch(/publicState\.status === "COMPLETED" &&[\s\S]{0,80}[Cc]redential/);
  });

  it("rendering the context panel makes no network request and does not affect the explicit session-creation button", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const panelStart = source.indexOf('sourceParam === "demo" && (');
    const panelEnd = source.indexOf("Sandbox only", panelStart);
    const panel = source.slice(panelStart, source.indexOf(")}", panelEnd) + 2);

    expect(panel).not.toMatch(/fetch\(/);
    expect(panel).not.toMatch(/onClick/);
    expect(panel).not.toMatch(/PravaSDK/);
    expect(panel).not.toMatch(/collectPAN/);

    // The explicit session-creation button and its single fetch call are untouched.
    const fetchCalls = source.match(/fetch\("\/api\/prava\/session"/g) ?? [];
    expect(fetchCalls.length).toBe(1);
  });

  it("preserves PHONE_ONLY and DESKTOP_EMBEDDED mode selection, guards, and audit events", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).toContain('selectMode("DESKTOP_EMBEDDED")');
    expect(source).toContain('selectMode("PHONE_ONLY")');
    expect(source).toContain("gateA2.session.created");
    expect(source).toContain("gateA2.sdk.initialized");
    expect(source).toContain("gateA2.collection.opened");
    expect(source).toContain("gateA2.flow.completed");
    expect(source).toContain("gateA2.flow.error");
    expect(source).toContain("gateA2.flow.cancelled");
    expect(source).toMatch(/if \(mode !== "DESKTOP_EMBEDDED"\) return;/);
  });
});
