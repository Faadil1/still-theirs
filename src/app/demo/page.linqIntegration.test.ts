import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "demo", "page.tsx");

describe("Demo page Linq trusted-perspective integration (static regression checks)", () => {
  it("calls /api/linq/trusted-perspective exactly once in source, guarded against firing when the decision isn't REQUEST_TRUSTED_CONTACT", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const matches = source.match(/\/api\/linq\/trusted-perspective/g) ?? [];
    expect(matches.length).toBe(1);

    const handlerStart = source.indexOf("async function handleSendPerspectiveRequest");
    const handlerBody = source.slice(handlerStart, source.indexOf("/api/linq/trusted-perspective"));
    expect(handlerBody).toMatch(/if \(!result \|\| result\.decision !== "REQUEST_TRUSTED_CONTACT"\) return;/);
  });

  it("guards against rapid double-clicks by checking linqStatus === \"SENDING\" before sending, and disables the button while sending", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const handlerStart = source.indexOf("async function handleSendPerspectiveRequest");
    const handlerBody = source.slice(handlerStart, source.indexOf("/api/linq/trusted-perspective"));
    expect(handlerBody).toMatch(/if \(linqStatus === "SENDING"\) return;/);
    expect(source).toMatch(/disabled=\{linqStatus === "SENDING"\}/);
  });

  it("the Send perspective request button only renders inside the risky (REQUEST_TRUSTED_CONTACT) branch, never the APPROVE branch", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const approveBranchStart = source.indexOf('result.decision === "APPROVE" ? (');
    const approveBranchEnd = source.indexOf(") : (", approveBranchStart);
    const approveBranch = source.slice(approveBranchStart, approveBranchEnd);
    expect(approveBranch).not.toMatch(/Send perspective request/);
    expect(approveBranch).not.toMatch(/handleSendPerspectiveRequest/);
    expect(approveBranch).not.toMatch(/\/api\/linq/);

    const riskyBranch = source.slice(approveBranchEnd);
    expect(riskyBranch).toMatch(/Send perspective request/);
  });

  it("never falls through to Prava after a Linq success or failure", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const handlerStart = source.indexOf("async function handleSendPerspectiveRequest");
    const handlerEnd = source.indexOf("\n  function handleReset", handlerStart) > -1 ? source.length : source.length;
    const handlerBody = source.slice(handlerStart, handlerEnd);
    expect(handlerBody).not.toMatch(/PravaSDK/);
    expect(handlerBody).not.toMatch(/collectPAN/);
    expect(handlerBody).not.toMatch(/\/api\/prava/);
  });

  it("shows the sanitized success/error copy without ever claiming unconditional delivery or transferring authority", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).toMatch(/Perspective request sent/);
    expect(source).toMatch(/Sent through Linq/);
    expect(source).toMatch(/No authority transferred/);
    expect(source).not.toMatch(/>\s*Delivered\s*</);
  });

  it("still never imports or references any Prava client/SDK/session code (unchanged boundary)", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/createPravaSession/);
    expect(source).not.toMatch(/PravaSDK/);
    expect(source).not.toMatch(/collectPAN/);
    expect(source).not.toMatch(/\/api\/prava\//);
  });
});
