import { describe, it, expect, vi } from "vitest";
import { SdkInitGuard } from "./sdkGuard";

function fakeSdk() {
  return { destroy: vi.fn() } as unknown as { destroy: () => void };
}

describe("SdkInitGuard", () => {
  it("initializes the SDK only once even when getOrCreate is called repeatedly", () => {
    const factory = vi.fn(fakeSdk);
    const guard = new SdkInitGuard();

    const a = guard.getOrCreate(factory as never);
    const b = guard.getOrCreate(factory as never);
    const c = guard.getOrCreate(factory as never);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(guard.timesInitialized).toBe(1);
  });

  it("destroy() clears the instance so a subsequent getOrCreate re-initializes", () => {
    const factory = vi.fn(fakeSdk);
    const guard = new SdkInitGuard();

    guard.getOrCreate(factory as never);
    guard.destroy();
    guard.getOrCreate(factory as never);

    expect(factory).toHaveBeenCalledTimes(2);
  });
});
