import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
    },
  },
  esbuild: { jsx: "automatic" },
  oxc: { jsx: { runtime: "automatic" } },
  // 15 s: the first import of the PDF and AI modules can pass 5 s on a busy machine or CI runner
  test: { environment: "node", include: ["tests/**/*.test.ts"], testTimeout: 15_000 },
});
