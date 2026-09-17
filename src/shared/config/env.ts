import { config } from "dotenv";
import { z } from "zod";

// Load .env into process.env. In deployment, host-provided env vars take
// precedence and a .env file is usually absent, which is fine.
config();

const booleanFromString = (defaultValue: boolean) =>
  z
    .union([z.boolean(), z.string()])
    .default(defaultValue)
    .transform((v) =>
      typeof v === "boolean" ? v : ["true", "1", "yes"].includes(v.trim().toLowerCase()),
    );

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),

    SECRET_KEY: z.string().min(1),
    JWT_EXPIRES_IN_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(12 * 3600),

    LOG_LEVEL: z.string().min(1).default("info"),

    CREDENTIALS: booleanFromString(true),
    CORS_ORIGINS: z.string().optional(),

    DATABASE_URL: z.string().min(1),

    SUPER_ADMIN_EMAIL: z.string().email().optional(),
    SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
    SUPER_ADMIN_NAME: z.string().min(1).optional(),
    SUPER_ADMIN_COMPANY_NAME: z.string().min(1).optional(),
  })
  .strip();

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("\nInvalid environment variables:\n");
  console.error(parsed.error.format());
  process.exit(1);
}
const env = parsed.data;

// Type-safe exports. Always import config from here, never read process.env directly elsewhere.
export const NODE_ENV = env.NODE_ENV;
export const PORT = env.PORT;
export const SECRET_KEY = env.SECRET_KEY;
export const JWT_EXPIRES_IN_SECONDS = env.JWT_EXPIRES_IN_SECONDS;

export const LOG_LEVEL = env.LOG_LEVEL;

export const CREDENTIALS = env.CREDENTIALS;

export const DATABASE_URL = env.DATABASE_URL;

export const SUPER_ADMIN_EMAIL = env.SUPER_ADMIN_EMAIL;
export const SUPER_ADMIN_PASSWORD = env.SUPER_ADMIN_PASSWORD;
export const SUPER_ADMIN_NAME = env.SUPER_ADMIN_NAME;
export const SUPER_ADMIN_COMPANY_NAME = env.SUPER_ADMIN_COMPANY_NAME;

export const CORS_ORIGIN_LIST =
  env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
