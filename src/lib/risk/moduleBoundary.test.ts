import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const RISK_SOURCE_FILES = [
  "src/lib/risk/types.ts",
  "src/lib/risk/schema.ts",
  "src/lib/risk/rules.ts",
  "src/lib/risk/scenarios.ts",
  "src/lib/risk/openaiExplanation.ts",
  "src/app/api/risk/analyze/route.ts",
  "src/app/demo/page.tsx",
  "src/lib/demo/demoFlow.ts",
];

describe("risk module structural boundary (never reaches Prava)", () => {
  it("no risk-path source file imports createPravaSession, the Prava server client, or PravaSDK", async () => {
    for (const relPath of RISK_SOURCE_FILES) {
      const source = await fs.readFile(path.join(process.cwd(), relPath), "utf-8");
      expect(source, `${relPath} must not import createPravaSession`).not.toMatch(/createPravaSession/);
      expect(source, `${relPath} must not import from lib\\/prava\\/server`).not.toMatch(/lib\/prava\/server/);
      expect(source, `${relPath} must not import PravaSDK`).not.toMatch(/PravaSDK/);
      expect(source, `${relPath} must not call collectPAN`).not.toMatch(/collectPAN/);
    }
  });

  it("no risk-path source file calls fetch('/api/prava/session') or references that path", async () => {
    for (const relPath of RISK_SOURCE_FILES) {
      const source = await fs.readFile(path.join(process.cwd(), relPath), "utf-8");
      expect(source, `${relPath} must not reference /api/prava/session`).not.toMatch(/\/api\/prava\/session/);
    }
  });

  it("the risky (urgent-gift-cards) scenario's response always reports pravaSessionCreated=false and paymentCredentialCreated=false", async () => {
    const { evaluatePurchaseIntent } = await import("./rules");
    const { URGENT_GIFT_CARDS_INTENT } = await import("./scenarios");
    const result = evaluatePurchaseIntent(URGENT_GIFT_CARDS_INTENT);
    expect(result.safeToCreatePravaSession).toBe(false);
    expect(result.credentialCreationAllowed).toBe(false);
  });
});
