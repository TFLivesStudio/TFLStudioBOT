import "dotenv/config";
import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/);
const origin = z
  .string()
  .url()
  .refine(
    (value) => new URL(value).origin === value,
    "Use an origin without a trailing slash or path",
  );
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_API_URL: origin,
  FRONTEND_URL: origin,
  CORS_ORIGIN: origin,
  COOKIE_SECURE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  BOT_TOKEN: z.string().min(30),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_CLIENT_SECRET: z.string().min(10),
  DISCORD_GUILD_ID: snowflake,
  ADMIN_ROLE_ID: snowflake,
  DATABASE_URL: z.string().min(10),
  SESSION_SECRET: z.string().min(32),
  GITHUB_WEBHOOK_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(16).optional(),
  ),
  GITHUB_TOKEN: z.string().optional(),
  INDEX_MESSAGE_CONTENT_INTENT: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  GITHUB_POLL_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success)
    throw new Error(
      "Invalid environment configuration: " +
        parsed.error.issues
          .map((i) => i.path.join(".") + " " + i.message)
          .join("; "),
    );
  const c = parsed.data;
  if (
    c.NODE_ENV === "production" &&
    (!c.COOKIE_SECURE ||
      !c.PUBLIC_API_URL.startsWith("https://") ||
      !c.FRONTEND_URL.startsWith("https://"))
  ) {
    throw new Error(
      "Production requires HTTPS for API/frontend and secure cookies",
    );
  }
  return c;
}
