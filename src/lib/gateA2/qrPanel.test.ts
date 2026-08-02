import { describe, it, expect } from "vitest";
import { shouldAutoHideQr, QR_AUTO_HIDE_MS } from "./qrPanel";

describe("shouldAutoHideQr", () => {
  it("does not hide before either the timeout or expiry", () => {
    const openedAt = 1_000_000;
    const now = openedAt + 10_000; // 10s elapsed
    const expiresAt = new Date(now + 60_000).toISOString(); // expires far in the future
    expect(shouldAutoHideQr(openedAt, expiresAt, now)).toBe(false);
  });

  it("hides once the 60-second auto-hide window elapses, even if not yet expired", () => {
    const openedAt = 1_000_000;
    const now = openedAt + QR_AUTO_HIDE_MS; // exactly 60s later
    const expiresAt = new Date(now + 60_000).toISOString();
    expect(shouldAutoHideQr(openedAt, expiresAt, now)).toBe(true);
  });

  it("hides as soon as the session expires, even before the 60s window elapses", () => {
    const openedAt = 1_000_000;
    const now = openedAt + 5_000; // only 5s elapsed
    const expiresAt = new Date(now - 1).toISOString(); // already expired
    expect(shouldAutoHideQr(openedAt, expiresAt, now)).toBe(true);
  });

  it("treats a null openedAt as zero elapsed time", () => {
    const now = 5_000_000;
    const expiresAt = new Date(now + 60_000).toISOString();
    expect(shouldAutoHideQr(null, expiresAt, now)).toBe(false);
  });

  it("treats a null expiresAt as never-expired, relying only on the timeout", () => {
    const openedAt = 1_000_000;
    expect(shouldAutoHideQr(openedAt, null, openedAt + 1000)).toBe(false);
    expect(shouldAutoHideQr(openedAt, null, openedAt + QR_AUTO_HIDE_MS)).toBe(true);
  });
});
