import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "gate-a2", "page.tsx");

describe("Gate A2 page source safety (static regression checks)", () => {
  it("never uses localStorage, sessionStorage, or document.cookie", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/localStorage/);
    expect(source).not.toMatch(/sessionStorage/);
    expect(source).not.toMatch(/document\.cookie/);
  });

  it("never console.logs or JSON.stringifies the session/SDK objects for display", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/console\.(log|error|warn|info)/);
  });

  it("never renders sessionToken or iframeUrl values in JSX", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    // getSessionForSdk() is the only place session/token values are read from
    // the controller, and it must only ever be called for collectPAN(), not
    // interpolated into rendered text.
    const jsxReturnStart = source.indexOf("return (");
    const jsxSection = source.slice(jsxReturnStart);
    expect(jsxSection).not.toMatch(/sessionToken/);
    expect(jsxSection).not.toMatch(/iframeUrl/);
    expect(jsxSection).not.toMatch(/getSessionForSdk/);
  });

  it("does not hard-code any card number, CVV, OTP, or passkey/WebAuthn fixture data", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    // Documented Prava sandbox test cards share the prefix 4622 9431 2313.
    expect(source).not.toMatch(/4622[\s-]?9431[\s-]?2313/);
    expect(source).not.toMatch(/\b\d{13,19}\b/); // any bare card-number-length digit run
    expect(source).not.toMatch(/\b456789\b/); // documented sandbox OTP value
    expect(source).not.toMatch(/navigator\.credentials/); // would indicate WebAuthn automation attempt
  });

  it("only exposes session identifiers as truncated suffixes in the public state shape, never full IDs", async () => {
    const sessionManagerPath = path.join(process.cwd(), "src", "lib", "gateA2", "sessionManager.ts");
    const source = await fs.readFile(sessionManagerPath, "utf-8");
    // getPublicState() must derive suffixes via suffix6(), not pass through raw session_id/order_id.
    const publicStateFn = source.slice(source.indexOf("getPublicState()"), source.indexOf("getSessionForSdk"));
    expect(publicStateFn).toMatch(/suffix6\(/);
    expect(publicStateFn).not.toMatch(/this\.session\.sessionId,/);
  });
});
