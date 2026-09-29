import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["vendor/openclaw/test/**/*.test.ts", "test/**/*.test.mjs"],
  },
});
