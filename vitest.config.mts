import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // Several route tests read/modify/write the real, shared
    // data/audit-log.json file. Running test files in parallel lets two
    // files race on that single file (each waits, then clobbers the
    // other's write) — this became visible once enough files touched it
    // concurrently. Serializing files avoids the race without changing
    // any product code.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "server-only": path.resolve(import.meta.dirname, "./vitest.server-only-stub.ts"),
    },
  },
});
