import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "demo", "page.tsx");

describe("Demo page — Visa Intelligent Commerce payment instruction card (APPROVE branch only)", () => {
  it("renders the payment instruction card only when the decision is APPROVE, between 'What we noticed' and the credential-pending area", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const whatWeNoticedIndex = source.indexOf("What we noticed");
    const cardGuardIndex = source.indexOf('result.decision === "APPROVE" && scenario && (');
    const noCredentialIndex = source.indexOf("No payment credential has been created yet.");

    expect(whatWeNoticedIndex).toBeGreaterThan(-1);
    expect(cardGuardIndex).toBeGreaterThan(whatWeNoticedIndex);
    expect(noCredentialIndex).toBeGreaterThan(cardGuardIndex);
  });

  it("shows the exact labels, heading, and definition-list rows", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).toContain("Payment instruction");
    expect(source).toContain("What the payment credential will be allowed to do");
    expect(source).toMatch(/<dt>Merchant<\/dt>/);
    expect(source).toMatch(/<dt>Maximum amount<\/dt>/);
    expect(source).toMatch(/<dt>Purpose<\/dt>/);
    expect(source).toMatch(/<dt>Credential scope<\/dt>/);
    expect(source).toMatch(/<dt>Human confirmation<\/dt>/);
    expect(source).toContain("One purchase only");
    expect(source).toContain("Required before creation");
    expect(source).toContain("This instruction will be sent to Prava only after you explicitly continue.");
    expect(source).toContain("Visa Intelligent Commerce-enabled through Prava.");
  });

  it("sources merchant and amount from the selected scenario rather than duplicating literal values", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const cardStart = source.indexOf('result.decision === "APPROVE" && scenario && (');
    const cardEnd = source.indexOf("This instruction will be sent to Prava", cardStart);
    const card = source.slice(cardStart, cardEnd);

    expect(card).toContain("{scenario.merchantLabel}");
    expect(card).toContain("{formatAmount(scenario.amountCents, scenario.currency)}");
    // No hard-coded dollar amount duplicating the scenario's amountCents.
    expect(card).not.toMatch(/\$\d/);
  });

  it("never makes a network request or renders a Prava/session control — rendering this card cannot create a session", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const cardStart = source.indexOf('result.decision === "APPROVE" && scenario && (');
    const cardEnd = source.indexOf("This instruction will be sent to Prava", cardStart);
    const card = source.slice(cardStart, source.indexOf(")}", cardEnd) + 2);

    expect(card).not.toMatch(/fetch\(/);
    expect(card).not.toMatch(/PravaSDK/);
    expect(card).not.toMatch(/collectPAN/);
    expect(card).not.toMatch(/onClick/);
  });

  it("preserves the existing 'No payment credential has been created yet.' text and 'Continue to secure payment' CTA as the only navigation toward Prava", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).toContain("No payment credential has been created yet.");
    expect(source).toMatch(/Continue to secure payment/);

    const approveCtaBlockStart = source.indexOf("No payment credential has been created yet.");
    const approveCtaBlockEnd = source.indexOf(") : (", approveCtaBlockStart);
    const approveCtaBlock = source.slice(approveCtaBlockStart, approveCtaBlockEnd);
    // Exactly one Link/navigation element in this block, targeting gate-a2.
    const hrefMatches = approveCtaBlock.match(/href="/g) ?? [];
    expect(hrefMatches.length).toBe(1);
    expect(approveCtaBlock).toMatch(/href="\/gate-a2\?mode=phone&source=demo"/);
  });

  it("does not exceed one call to /api/risk/analyze in source (payment instruction card adds no new fetch)", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const matches = source.match(/\/api\/risk\/analyze/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
