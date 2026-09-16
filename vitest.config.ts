import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // tsyringe checks for the reflect-metadata polyfill at import time.
    setupFiles: ["reflect-metadata"],
    // Just enough for src/shared/config/env.ts's validation to pass at import
    // time. Unit tests here use in-memory fakes, not this DATABASE_URL.
    env: {
      SECRET_KEY: "test-secret-key-not-for-real-use",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    },
  },
});
