import { defineConfig } from "vitest/config";

const isIntegrationRun = process.env["CLAUDE_INTEGRATION"] === "1";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: isIntegrationRun ? ["node_modules", "dist"] : ["tests/integration/**", "node_modules", "dist"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
    },
  },
});
