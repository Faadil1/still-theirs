import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";
import type { GateA2Status } from "@/lib/gateA2/sessionManager";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "gate-a2", "page.tsx");

/**
 * Pure re-implementation of the /gate-a2 step-indicator derivation, kept
 * in lockstep with src/app/gate-a2/page.tsx. Exercising it directly (rather
 * than rendering the page, which this project doesn't do) proves the
 * indicator can never mark a step complete ahead of the true controller
 * state — in particular that SAFE_ERROR occurring before any session was
 * ever created must never show step 2 as complete.
 */
function deriveSteps(status: GateA2Status) {
  const step1Complete = true;
  const step2Active = status === "CREATING_SESSION";
  const step2Complete = status === "READY_FOR_CARD" || status === "AWAITING_USER_AUTHENTICATION" || status === "COMPLETED";
  const step3Active = status === "READY_FOR_CARD" || status === "AWAITING_USER_AUTHENTICATION";
  const step3Complete = status === "COMPLETED";
  return { step1Complete, step2Active, step2Complete, step3Active, step3Complete };
}

describe("/gate-a2 step indicator truthfulness", () => {
  it("the page's actual derivation matches this test's re-implementation (guards against drift)", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/const sessionExists = publicState\.status !== "IDLE";/);
    expect(source).toMatch(/const step2Active = publicState\.status === "CREATING_SESSION";/);
    expect(source).toMatch(
      /const step2Complete =\s*publicState\.status === "READY_FOR_CARD" \|\|\s*publicState\.status === "AWAITING_USER_AUTHENTICATION" \|\|\s*publicState\.status === "COMPLETED";/
    );
    expect(source).toMatch(
      /const step3Active = publicState\.status === "READY_FOR_CARD" \|\| publicState\.status === "AWAITING_USER_AUTHENTICATION";/
    );
    expect(source).toMatch(/const step3Complete = publicState\.status === "COMPLETED";/);
  });

  it("SAFE_ERROR before session creation never marks step 2 complete", () => {
    const steps = deriveSteps("SAFE_ERROR");
    expect(steps.step2Complete).toBe(false);
    expect(steps.step2Active).toBe(false);
    expect(steps.step3Complete).toBe(false);
    expect(steps.step3Active).toBe(false);
  });

  it("IDLE shows only purchase approval complete", () => {
    const steps = deriveSteps("IDLE");
    expect(steps.step1Complete).toBe(true);
    expect(steps.step2Complete).toBe(false);
    expect(steps.step2Active).toBe(false);
    expect(steps.step3Complete).toBe(false);
    expect(steps.step3Active).toBe(false);
  });

  it("CANCELLED shows only purchase approval complete", () => {
    const steps = deriveSteps("CANCELLED");
    expect(steps.step2Complete).toBe(false);
    expect(steps.step2Active).toBe(false);
    expect(steps.step3Complete).toBe(false);
  });

  it("CREATING_SESSION shows step 2 active, not complete", () => {
    const steps = deriveSteps("CREATING_SESSION");
    expect(steps.step2Active).toBe(true);
    expect(steps.step2Complete).toBe(false);
    expect(steps.step3Active).toBe(false);
    expect(steps.step3Complete).toBe(false);
  });

  it("READY_FOR_CARD shows step 2 complete and step 3 active", () => {
    const steps = deriveSteps("READY_FOR_CARD");
    expect(steps.step2Complete).toBe(true);
    expect(steps.step2Active).toBe(false);
    expect(steps.step3Active).toBe(true);
    expect(steps.step3Complete).toBe(false);
  });

  it("AWAITING_USER_AUTHENTICATION shows step 2 complete and step 3 active", () => {
    const steps = deriveSteps("AWAITING_USER_AUTHENTICATION");
    expect(steps.step2Complete).toBe(true);
    expect(steps.step3Active).toBe(true);
    expect(steps.step3Complete).toBe(false);
  });

  it("COMPLETED shows all three steps complete", () => {
    const steps = deriveSteps("COMPLETED");
    expect(steps.step1Complete).toBe(true);
    expect(steps.step2Complete).toBe(true);
    expect(steps.step3Complete).toBe(true);
    expect(steps.step3Active).toBe(false);
  });
});
