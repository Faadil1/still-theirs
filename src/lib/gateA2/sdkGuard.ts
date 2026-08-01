import type { PravaSDK } from "@prava-sdk/core";

/**
 * Ensures the Prava SDK is instantiated at most once per module lifetime,
 * even under React Strict Mode's intentional double-invocation of effects.
 */
export class SdkInitGuard<T extends PravaSDK = PravaSDK> {
  private instance: T | null = null;
  private initCount = 0;

  getOrCreate(factory: () => T): T {
    if (!this.instance) {
      this.instance = factory();
      this.initCount += 1;
    }
    return this.instance;
  }

  get timesInitialized(): number {
    return this.initCount;
  }

  destroy(): void {
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
  }
}
