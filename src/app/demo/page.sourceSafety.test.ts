import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "demo", "page.tsx");

describe("Demo page source safety (static regression checks)", () => {
  it("never uses useEffect to fetch on mount — no analysis request can fire on page load", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/useEffect/);
  });

  it("calls /api/risk/analyze exactly once in the source, guarded by controller.canSubmit()", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const matches = source.match(/\/api\/risk\/analyze/g) ?? [];
    expect(matches.length).toBe(1);

    const handlerStart = source.indexOf("async function handleCheck");
    const handlerBody = source.slice(handlerStart, source.indexOf("/api/risk/analyze"));
    expect(handlerBody).toMatch(/if \(!controller\.canSubmit\(\)\) return;/);
  });

  it("never imports or references any Prava client/SDK/session code", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/createPravaSession/);
    expect(source).not.toMatch(/PravaSDK/);
    expect(source).not.toMatch(/collectPAN/);
    expect(source).not.toMatch(/\/api\/prava\//);
  });

  it("never renders chain-of-thought or hidden reasoning — only the approved explanation fields", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/reasoning|chainOfThought|chain_of_thought|thinking/i);
  });

  it("never uses guardian/ward/elderly/dependent/forbidden/permission language", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/guardian|\bward\b|elderly|dependent|forbidden|permission/i);
  });

  it("never uses paternalistic, accusatory, or fear-based language", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(
      /we blocked|you cannot continue|you are being scammed|you are vulnerable|scam detected|danger/i
    );
  });

  it("never exposes raw scores, tokens, or prompts in the UI", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/result\.score\b/);
    expect(source).not.toMatch(/sessionToken|iframeUrl/);
  });
});
