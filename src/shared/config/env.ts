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

    // Pooled connection (app runtime queries) and direct connection (migrations).
    // With Supabase: DATABASE_URL is the pgbouncer pooler (port 6543), DIRECT_URL
    // is the direct connection (port 5432). Falls back to DATABASE_URL if
    // DIRECT_URL isn't set, e.g. a plain local Postgres with no pooler at all.
    DATABASE_URL: z.string().min(1),
    DIRECT_URL: z.string().min(1).optional(),

    FRONTEND_URL: z.string().url().default("http://localhost:3000"),
    INVITATION_EXPIRY_HOURS: z.coerce.number().int().positive().default(48),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: booleanFromString(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default("Interview Platform <no-reply@localhost>"),

    SUPER_ADMIN_EMAIL: z.string().email().optional(),
    SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
    SUPER_ADMIN_NAME: z.string().min(1).optional(),
    SUPER_ADMIN_COMPANY_NAME: z.string().min(1).optional(),
    SUPER_ADMIN_COMPANY_SLUG: z.string().min(1).optional(),
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
export const DIRECT_URL = env.DIRECT_URL ?? env.DATABASE_URL;

export const FRONTEND_URL = env.FRONTEND_URL;
export const INVITATION_EXPIRY_HOURS = env.INVITATION_EXPIRY_HOURS;

export const SMTP_HOST = env.SMTP_HOST;
export const SMTP_PORT = env.SMTP_PORT;
export const SMTP_SECURE = env.SMTP_SECURE;
export const SMTP_USER = env.SMTP_USER;
export const SMTP_PASS = env.SMTP_PASS;
export const SMTP_FROM = env.SMTP_FROM;

export const SUPER_ADMIN_EMAIL = env.SUPER_ADMIN_EMAIL;
export const SUPER_ADMIN_PASSWORD = env.SUPER_ADMIN_PASSWORD;
export const SUPER_ADMIN_NAME = env.SUPER_ADMIN_NAME;
export const SUPER_ADMIN_COMPANY_NAME = env.SUPER_ADMIN_COMPANY_NAME;
export const SUPER_ADMIN_COMPANY_SLUG = env.SUPER_ADMIN_COMPANY_SLUG;

export const CORS_ORIGIN_LIST =
  env.CORS_ORIGINS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean) ?? [];
