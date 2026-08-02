import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const GATE_A2_PAGE_PATH = path.join(process.cwd(), "src", "app", "gate-a2", "page.tsx");
const DEMO_PAGE_PATH = path.join(process.cwd(), "src", "app", "demo", "page.tsx");

describe("APPROVE (/demo) -> PHONE_ONLY (/gate-a2) integration", () => {
  describe("/demo APPROVE path", () => {
    it("navigates to /gate-a2?mode=phone&source=demo via a plain Link, not a click handler that calls an API", async () => {
      const source = await fs.readFile(DEMO_PAGE_PATH, "utf-8");
      expect(source).toMatch(/href="\/gate-a2\?mode=phone&source=demo"/);
      // The old click-driven "continue to Prava pending" transition must be gone.
      expect(source).not.toMatch(/handleContinueToPrava/);
      expect(source).not.toMatch(/continueToPravaPending/);
      expect(source).not.toMatch(/PRAVA_PENDING/);
    });

    it("passes through no sensitive query values (only mode and source appear on any /gate-a2 link)", async () => {
      const source = await fs.readFile(DEMO_PAGE_PATH, "utf-8");
      const gateLinks = source.match(/\/gate-a2\?[^"]*/g) ?? [];
      expect(gateLinks.length).toBeGreaterThan(0);
      for (const link of gateLinks) {
        expect(link).not.toMatch(/session|token|orderId|amount|iframe|openai|statement/i);
      }
    });

    it("the risky (REQUEST_TRUSTED_CONTACT) path never navigates to Gate A2 and has no Prava button", async () => {
      const source = await fs.readFile(DEMO_PAGE_PATH, "utf-8");
      const decisionStart = source.indexOf('view === "DECISION"');
      const branchStart = source.indexOf("result.decision === \"APPROVE\" ?", decisionStart);
      const riskyBranch = source.slice(source.indexOf(") : (", branchStart), source.indexOf(")}", source.indexOf(") : (", branchStart)));
      expect(riskyBranch).not.toMatch(/gate-a2/);
      expect(riskyBranch).not.toMatch(/PravaSDK/);
      expect(riskyBranch).not.toMatch(/collectPAN/);
      expect(riskyBranch).not.toMatch(/\/api\/prava/);
    });

    it("still never imports or references any Prava client/SDK/session code (unchanged boundary)", async () => {
      const source = await fs.readFile(DEMO_PAGE_PATH, "utf-8");
      expect(source).not.toMatch(/createPravaSession/);
      expect(source).not.toMatch(/PravaSDK/);
      expect(source).not.toMatch(/collectPAN/);
      expect(source).not.toMatch(/\/api\/prava\//);
    });
  });

  describe("/gate-a2 query-param handling", () => {
    it("reads mode/source from the URL via useSearchParams, sanitized through literal-value functions", async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      expect(source).toMatch(/useSearchParams/);
      expect(source).toMatch(/function sanitizeModeParam\(raw: string \| null\): "phone" \| null \{\s*return raw === "phone" \? "phone" : null;/);
      expect(source).toMatch(/function sanitizeSourceParam\(raw: string \| null\): "demo" \| null \{\s*return raw === "demo" \? "demo" : null;/);
    });

    it("unsafe/unexpected query values are ignored (sanitizers reject anything but the exact literal)", async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      const modeFnStart = source.indexOf("function sanitizeModeParam");
      const modeFnBody = source.slice(modeFnStart, source.indexOf("}", modeFnStart));
      expect(modeFnBody).toContain('raw === "phone"');
      expect(modeFnBody).not.toMatch(/\.includes\(/);
      expect(modeFnBody).not.toMatch(/toLowerCase/);
    });

    it("preselecting mode from the URL only sets local state and cannot itself trigger session creation", async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      const stateInit = source.indexOf("const [mode, setMode] = useState<GateA2Mode | null>(");
      const stateInitLine = source.slice(stateInit, source.indexOf(");", stateInit) + 2);
      expect(stateInitLine).toMatch(/initialModeParam === "phone" \? "PHONE_ONLY" : null/);
      expect(stateInitLine).not.toMatch(/fetch\(/);
      expect(stateInitLine).not.toMatch(/createSession/);
      expect(stateInitLine).not.toMatch(/startSession/);
    });

    it("wraps the page in Suspense since useSearchParams requires it", async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      expect(source).toMatch(/<Suspense fallback=\{null\}>/);
      expect(source).toMatch(/<GateA2PageInner \/>/);
    });
  });

  describe("/gate-a2 demo context panel and explicit session-creation boundary", () => {
    it("shows the non-sensitive demo context panel only when source=demo", async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      const panelStart = source.indexOf('sourceParam === "demo" && (');
      expect(panelStart).toBeGreaterThan(-1);
      const panel = source.slice(panelStart, source.indexOf("Verification continues on your phone.", panelStart));
      expect(panel).toContain("Routine groceries");
      expect(panel).toContain("Approved by the Still Theirs safety gate.");
      expect(panel).toContain("Payment credential not created yet.");
    });

    it('has a "Back to demo" link pointing at /demo, shown only when source=demo', async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      expect(source).toMatch(/<Link href="\/demo"[^>]*>\s*Back to demo\s*<\/Link>/);
    });

    it('the phone-session button is now labeled "Create secure phone session" and remains the only trigger for /api/prava/session', async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      expect(source).toMatch(/Create secure phone session/);
      expect(source).not.toMatch(/>\s*Create phone session\s*</);

      const fetchCalls = source.match(/fetch\("\/api\/prava\/session"/g) ?? [];
      expect(fetchCalls.length).toBe(1);
      // That single fetch call must live inside createSession(), which is only
      // invoked from handleStart (desktop) and handleCreatePhoneSession (phone),
      // both explicit user-initiated handlers, never from a mount effect.
      const createSessionStart = source.indexOf("async function createSession");
      const createSessionEnd = source.indexOf("\n  }", createSessionStart);
      const createSessionBody = source.slice(createSessionStart, createSessionEnd);
      expect(createSessionBody).toContain('fetch("/api/prava/session"');
    });

    it("reuses the existing PHONE_ONLY QR flow unchanged (still gated off the DESKTOP_EMBEDDED collectPAN mount)", async () => {
      const source = await fs.readFile(GATE_A2_PAGE_PATH, "utf-8");
      const mountEffectStart = source.indexOf("// Mount the embedded card-collection UI");
      const mountEffectBody = source.slice(mountEffectStart, source.indexOf("}, [mode, publicState.status"));
      expect(mountEffectBody.indexOf('if (mode !== "DESKTOP_EMBEDDED") return;')).toBe(0 + mountEffectBody.indexOf('if (mode !== "DESKTOP_EMBEDDED") return;'));
      expect(mountEffectBody).toMatch(/if \(mode !== "DESKTOP_EMBEDDED"\) return;/);
    });
  });
});
