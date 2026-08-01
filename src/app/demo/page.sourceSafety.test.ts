import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

const PAGE_PATH = path.join(process.cwd(), "src", "app", "demo", "page.tsx");

describe("Demo page source safety (static regression checks)", () => {
  it("never uses useEffect to fetch on mount — no analysis request can fire on page load", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/useEffect/);
  });

  it("calls /api/risk/analyze exactly once in the source, guarded by a busy/selection check", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    const matches = source.match(/\/api\/risk\/analyze/g) ?? [];
    expect(matches.length).toBe(1);

    const handlerStart = source.indexOf("async function handleReview");
    const handlerBody = source.slice(handlerStart, source.indexOf("/api/risk/analyze"));
    expect(handlerBody).toMatch(/if \(!selected \|\| busy\) return;/);
  });

  it("never renders chain-of-thought or hidden reasoning — only the approved explanation fields", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/reasoning|chainOfThought|chain_of_thought|thinking/i);
  });

  it("never uses guardian/ward/elderly/dependent/forbidden/permission language", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/guardian|\bward\b|elderly|dependent|forbidden|permission/i);
  });

  it("never uses paternalistic or accusatory language", async () => {
    const source = await fs.readFile(PAGE_PATH, "utf-8");
    expect(source).not.toMatch(/we blocked|you cannot continue|you are being scammed|you are vulnerable/i);
  });
});
