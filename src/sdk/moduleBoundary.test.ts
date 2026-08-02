import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const SDK_SOURCE_FILES = ["src/sdk/types.ts", "src/sdk/evaluatePurchase.ts", "src/sdk/index.ts"];

describe("sdk module structural boundary (never reaches Prava, never calls a partner provider)", () => {
  it("no SDK source file imports PravaSDK, createPravaSession, or the Prava server client, or calls collectPAN", async () => {
    for (const relPath of SDK_SOURCE_FILES) {
      const source = await fs.readFile(path.join(process.cwd(), relPath), "utf-8");
      expect(source, `${relPath} must not import PravaSDK`).not.toMatch(/PravaSDK/);
      expect(source, `${relPath} must not import createPravaSession`).not.toMatch(/createPravaSession/);
      expect(source, `${relPath} must not import from lib\\/prava\\/server`).not.toMatch(/lib\/prava\/server/);
      expect(source, `${relPath} must not call collectPAN`).not.toMatch(/collectPAN/);
      expect(source, `${relPath} must not reference /api/prava/session`).not.toMatch(/\/api\/prava\/session/);
    }
  });

  it("no SDK source file references card, CVV, OTP, passkey, session token, or iframe URL data", async () => {
    for (const relPath of SDK_SOURCE_FILES) {
      const source = await fs.readFile(path.join(process.cwd(), relPath), "utf-8");
      expect(source, `${relPath} must not reference cvv`).not.toMatch(/\bcvv\b/i);
      expect(source, `${relPath} must not reference an OTP field`).not.toMatch(/\botp\b/i);
      expect(source, `${relPath} must not reference passkey/WebAuthn data`).not.toMatch(/navigator\.credentials|webauthn/i);
      expect(source, `${relPath} must not reference sessionToken`).not.toMatch(/sessionToken/);
      expect(source, `${relPath} must not reference iframeUrl`).not.toMatch(/iframeUrl/);
    }
  });

  it("the optional future provider interfaces are declared as types only — no class implementation, no fetch/network call", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src/sdk/types.ts"), "utf-8");
    expect(source).toMatch(/export interface TrustedPerspectiveProvider/);
    expect(source).toMatch(/export interface MerchantContextProvider/);
    expect(source).toMatch(/export interface AgentAdapterMetadata/);
    // No implementation of these providers anywhere in the SDK.
    expect(source).not.toMatch(/class \w+ implements (TrustedPerspectiveProvider|MerchantContextProvider)/);
    for (const relPath of SDK_SOURCE_FILES) {
      const fileSource = await fs.readFile(path.join(process.cwd(), relPath), "utf-8");
      expect(fileSource, `${relPath} must not call fetch`).not.toMatch(/\bfetch\(/);
      expect(fileSource, `${relPath} must not reference Linq/Senso/NANDA network calls`).not.toMatch(
        /https?:\/\/(api\.)?(linq|senso|nanda)/i
      );
    }
  });

  it("evaluatePurchase.ts only dynamically imports the OpenAI explanation layer, and only inside the explain branch", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src/sdk/evaluatePurchase.ts"), "utf-8");
    const dynamicImportIndex = source.indexOf('await import("@/lib/risk/openaiExplanation")');
    expect(dynamicImportIndex).toBeGreaterThan(-1);
    const guardIndex = source.indexOf("if (input.explain)");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(dynamicImportIndex).toBeGreaterThan(guardIndex);
    // No static/top-level import of the OpenAI explanation module.
    expect(source).not.toMatch(/^import .*openaiExplanation/m);
  });

  it("APPROVE always maps to pravaSessionPermitted=true/OFFER_PRAVA_VERIFICATION, and REQUEST_TRUSTED_CONTACT to the opposite, by construction in source", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src/sdk/evaluatePurchase.ts"), "utf-8");
    expect(source).toMatch(/const pravaSessionPermitted = decision === "APPROVE";/);
    expect(source).toMatch(/decision === "APPROVE" \? "OFFER_PRAVA_VERIFICATION" : "OFFER_TRUSTED_PERSPECTIVE"/);
  });
});
