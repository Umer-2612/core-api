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
      SUPER_ADMIN_EMAIL: "admin@test.local",
      SUPER_ADMIN_PASSWORD: "test-password-123",
      SUPER_ADMIN_NAME: "Test Admin",
      SUPER_ADMIN_COMPANY_NAME: "Test Co",
      SUPER_ADMIN_COMPANY_SLUG: "test-co",
    },
  },
});
