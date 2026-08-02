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
    const jsxReturnStart = source.lastIndexOf("return (\n    <div");
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

  describe("QR phone-transfer panel (dev-only)", () => {
    it("gates the QR feature behind a non-production check", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      expect(source).toMatch(/IS_DEV_OR_SANDBOX\s*=\s*process\.env\.NODE_ENV\s*!==\s*"production"/);
    });

    it("only sets the QR panel visible inside the two explicit user actions (handleOpenOnPhone, handleCreatePhoneSession), never in a mount/session effect", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const setVisibleCalls = source.match(/setQrPanelOpen\(true\)/g) ?? [];
      expect(setVisibleCalls.length).toBe(2);

      const handlerStart = source.indexOf("function handleOpenOnPhone");
      const handlerEnd = source.indexOf("\n  }", handlerStart);
      const handlerBody = source.slice(handlerStart, handlerEnd);
      expect(handlerBody).toContain("setQrPanelOpen(true)");
      expect(handlerBody).toMatch(/if \(!IS_DEV_OR_SANDBOX\) return;/);
      expect(handlerBody).toMatch(/if \(!sessionForSdk\) return;/);
    });

    it("handleOpenOnPhone (dev-reopen for an existing desktop session) never creates another Prava session", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const handlerStart = source.indexOf("function handleOpenOnPhone");
      const handlerEnd = source.indexOf("\n  }", handlerStart);
      const handlerBody = source.slice(handlerStart, handlerEnd);
      expect(handlerBody).not.toMatch(/fetch\(/);
      expect(handlerBody).not.toMatch(/startSession/);
    });

    it("handleCancel closes the QR panel (QR disappears on reset/cancel)", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const handlerStart = source.indexOf("function handleCancel");
      const handlerEnd = source.indexOf("\n  }", handlerStart);
      const handlerBody = source.slice(handlerStart, handlerEnd);
      expect(handlerBody).toContain("closeQrPanel()");
    });

    it("never renders the raw iframe URL as visible text, never adds a copy-to-clipboard control, and only draws it into a canvas", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const jsxReturnStart = source.lastIndexOf("return (\n    <div");
      const jsxSection = source.slice(jsxReturnStart);

      expect(jsxSection).not.toMatch(/iframeUrl/);
      expect(jsxSection).not.toMatch(/navigator\.clipboard/i);
      expect(jsxSection).not.toMatch(/copy/i);
      expect(jsxSection).toContain("<canvas");
      expect(jsxSection).toContain("Temporary Prava session");
    });

    it("the iframe URL is read only twice (collectPAN mount, QR draw) and never passed to fetch/JSON.stringify/postGateA2Event", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const occurrences = source.match(/\.iframeUrl\b/g) ?? [];
      expect(occurrences.length).toBe(2);

      for (const match of source.matchAll(/.{0,80}\.iframeUrl\b.{0,80}/g)) {
        const window = match[0];
        expect(window).not.toMatch(/postGateA2Event/);
        expect(window).not.toMatch(/JSON\.stringify/);
        expect(window).not.toMatch(/fetch\(/);
      }
    });

    it("never uses an external QR-generation API — only the local qrcode package", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      expect(source).toMatch(/from "qrcode"/);
      expect(source).not.toMatch(/api\.qrserver\.com|qrcode-monkey|goqr\.me/i);
    });
  });

  describe("PHONE_ONLY mode (single-use session, no desktop SDK)", () => {
    it("the collectPAN mount effect is gated on mode === DESKTOP_EMBEDDED before any PravaSDK/collectPAN usage — PHONE_ONLY never reaches it", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const mountEffectStart = source.indexOf("// Mount the embedded card-collection UI");
      const mountEffectBody = source.slice(mountEffectStart, source.indexOf("}, [mode, publicState.status"));
      const guardIndex = mountEffectBody.indexOf('if (mode !== "DESKTOP_EMBEDDED") return;');
      const sdkIndex = mountEffectBody.indexOf("new PravaSDK");
      const collectPanIndex = mountEffectBody.indexOf(".collectPAN(");
      expect(guardIndex).toBeGreaterThan(-1);
      expect(sdkIndex).toBeGreaterThan(guardIndex);
      expect(collectPanIndex).toBeGreaterThan(guardIndex);
    });

    it("the Prava card-form container is only rendered in DESKTOP_EMBEDDED mode", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      expect(source).toMatch(/mode === "DESKTOP_EMBEDDED" && <div id="prava-card-form"/);
    });

    it("handleCreatePhoneSession creates exactly one session, only opens the QR after success, and never touches PravaSDK/collectPAN", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const handlerStart = source.indexOf("async function handleCreatePhoneSession");
      const handlerEnd = source.indexOf("\n  }", handlerStart);
      const handlerBody = source.slice(handlerStart, handlerEnd);

      const createCalls = handlerBody.match(/createSession\(\)/g) ?? [];
      expect(createCalls.length).toBe(1);
      expect(handlerBody).toMatch(/if \(!ready\) return;/);
      expect(handlerBody).toContain("setQrPanelOpen(true)");
      expect(handlerBody).not.toMatch(/PravaSDK/);
      expect(handlerBody).not.toMatch(/collectPAN/);
    });

    it("nothing on the desktop opens, preloads, fetches, or navigates to the iframe URL — its only use is as QR-encoder input", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      // Every read of .iframeUrl must be immediately followed by either the
      // collectPAN call (desktop mode) or QRCode.toCanvas (phone/QR mode).
      for (const match of source.matchAll(/.{0,100}\.iframeUrl\b.{0,120}/g)) {
        const window = match[0];
        expect(window).not.toMatch(/window\.open/);
        expect(window).not.toMatch(/<iframe/);
        expect(window).not.toMatch(/\.src\s*=/);
        expect(window).not.toMatch(/new Image/);
        expect(window).not.toMatch(/HEAD/);
        expect(window).not.toMatch(/link\.rel\s*=\s*["']prefetch["']/);
        const usedByQr = /QRCode\.toCanvas/.test(window);
        const usedByCollectPan = /iframeUrl:/.test(window);
        expect(usedByQr || usedByCollectPan).toBe(true);
      }
    });

    it("mode selection is only offered before any session exists, and cannot change once a session is active", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const fnStart = source.indexOf("function selectMode");
      const fnEnd = source.indexOf("\n  }", fnStart);
      const fnBody = source.slice(fnStart, fnEnd);
      expect(fnBody).toMatch(
        /if \(publicState\.status !== "IDLE" && publicState\.status !== "CANCELLED" && publicState\.status !== "SAFE_ERROR" && publicState\.status !== "COMPLETED"\) return;/
      );
      // The mode-choice buttons are only rendered while mode is null.
      expect(source).toMatch(/\{mode === null && \(/);
    });

    it("resetting (Cancel) clears mode back to null, returning to mode selection", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      const handlerStart = source.indexOf("function handleCancel");
      const handlerEnd = source.indexOf("\n  }", handlerStart);
      const handlerBody = source.slice(handlerStart, handlerEnd);
      expect(handlerBody).toContain("setMode(null)");
    });

    it("PHONE_ONLY status copy never invents a callback success and points to the Prava screen/dashboard instead", async () => {
      const source = await fs.readFile(PAGE_PATH, "utf-8");
      expect(source).toMatch(/Complete the verification on your phone\. Confirm the result using the Prava screen or dashboard\./);
    });
  });
});
