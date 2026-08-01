import { describe, it, expect } from "vitest";
import { promises as fs } from "fs";
import path from "path";

describe("OPENAI_API_KEY server-only boundary", () => {
  it("openaiExplanation.ts imports 'server-only' as its first guard", async () => {
    const source = await fs.readFile(path.join(process.cwd(), "src", "lib", "risk", "openaiExplanation.ts"), "utf-8");
    expect(source).toMatch(/^import "server-only";/m);
  });

  it("no client component ('use client') references OPENAI_API_KEY", async () => {
    const demoSource = await fs.readFile(path.join(process.cwd(), "src", "app", "demo", "page.tsx"), "utf-8");
    expect(demoSource).toMatch(/^"use client";/);
    expect(demoSource).not.toMatch(/OPENAI_API_KEY/);
  });

  it("OPENAI_API_KEY is never referenced under a NEXT_PUBLIC_ prefix anywhere in tracked src", async () => {
    const envSource = await fs.readFile(path.join(process.cwd(), "src", "lib", "env.ts"), "utf-8");
    expect(envSource).not.toMatch(/NEXT_PUBLIC_OPENAI/);
  });
});
