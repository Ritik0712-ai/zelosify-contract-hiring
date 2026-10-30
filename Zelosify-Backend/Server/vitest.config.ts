import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    coverage: {
      provider: "istanbul",
      reporter: ["text", "json", "html"],
      exclude: ["**/tests/**", "**/__tests__/**", "**/node_modules/**"],
    },
    include: ["**/tests/**/*.test.ts", "**/__tests__/**/*.test.ts"],
    exclude: ["**/dist/**", "**/build/**", "**/node_modules/**"],
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
