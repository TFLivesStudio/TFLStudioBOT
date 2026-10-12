import "dotenv/config";
import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/);
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("127.0.0.1"),
  PUBLIC_API_URL: z.string().url(),
  FRONTEND_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  COOKIE_SECURE: z.enum(["true", "false"]).default("true").transform(v => v === "true"),
  BOT_TOKEN: z.string().min(30),
  DISCORD_CLIENT_ID: snowflake,
  DISCORD_CLIENT_SECRET: z.string().min(10),
  DISCORD_GUILD_ID: snowflake,
  ADMIN_ROLE_ID: snowflake,
  DATABASE_URL: z.string().min(10),
  GITHUB_WEBHOOK_SECRET: z.string().min(16).optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_POLL_ENABLED: z.enum(["true", "false"]).default("false").transform(v => v === "true"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
});
export type Config = z.infer<typeof schema>;
export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) throw new Error("Invalid environment configuration: " + parsed.error.issues.map(i => i.path.join(".") + " " + i.message).join("; "));
  const c = parsed.data;
  if (c.NODE_ENV === "production" && (!c.COOKIE_SECURE || !c.PUBLIC_API_URL.startsWith("https://") || !c.FRONTEND_URL.startsWith("https://"))) {
    throw new Error("Production requires HTTPS for API/frontend and secure cookies");
  }
  return c;
}
