import { config as loadDotenv } from "dotenv";
import { z } from "zod";

// Load .env before anything else reads process.env. Every other module must
// import `env` from here rather than touching process.env directly.
loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),

  // Seeded admin (consumed by the Phase 2 seed script)
  ADMIN_NAME: z.string().default("Admin"),
  ADMIN_EMAIL: z.string().default("admin@doctortracker.com"),
  ADMIN_PASSWORD: z.string().min(6).default("Admin@123"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  console.error(`Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
