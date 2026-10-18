import { withFetchExtras } from "../helpers/fetch.js";
/** Real Core + PostgreSQL; only Discord network I/O is simulated. Never imported by production. */
import pg from "pg";
import { createHttp } from "../../apps/core/src/http.js";
import { IDS, DEPARTMENTS } from "@tfl/shared";
import type { Config } from "@tfl/config";
import type { Client } from "discord.js";
const database = process.env.TEST_DATABASE_URL;
if (process.env.NODE_ENV !== "test" || !database?.includes("studio_test"))
  throw Error("E2E requires an isolated studio_test database");
const db = new pg.Pool({ connectionString: database, max: 8 });
const origin = "http://127.0.0.1:19080";
const config = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  HOST: "127.0.0.1",
  PORT: 19081,
  PUBLIC_API_URL: origin,
  FRONTEND_URL: origin,
  CORS_ORIGIN: origin,
  COOKIE_SECURE: false,
  SESSION_SECRET: "e2e_FAKE_session_secret_0123456789abcdef",
  BOT_TOKEN: "e2e_FAKE_bot_token_0123456789abcdef",
  DISCORD_CLIENT_ID: "1559294093962510386",
  DISCORD_CLIENT_SECRET: "e2e_FAKE_client_secret",
  DISCORD_GUILD_ID: IDS.guild,
  ADMIN_ROLE_ID: IDS.admin,
  DATABASE_URL: database,
  GITHUB_POLL_ENABLED: false,
  INDEX_MESSAGE_CONTENT_INTENT: false,
} satisfies Config;
const adminId = "111111111111111111";
const departmentId = "222222222222222222";
let revoked = false;
globalThis.fetch = withFetchExtras(async (input, init) => {
  const path = String(input);
  if (path === "https://discord.com/api/v10/oauth2/token")
    return Response.json({
      access_token: String((init?.body as URLSearchParams).get("code")),
    });
  if (path === "https://discord.com/api/v10/users/@me")
    return Response.json({
      id:
        (init?.headers as Record<string, string>).Authorization ===
        "Bearer department"
          ? departmentId
          : adminId,
    });
  if (path.includes("/members/")) {
    const id = path.split("/").at(-1)!;
    return Response.json({
      user: {
        id,
        username: id === adminId ? "Admin de pruebas" : "Hosting de pruebas",
      },
      roles: id === adminId && !revoked ? [IDS.admin] : [IDS.roles.hosting],
      pending: false,
    });
  }
  if (path.endsWith("/roles"))
    return Response.json([
      { id: IDS.guild, permissions: "0" },
      { id: IDS.admin, permissions: "8" },
      ...Object.values(DEPARTMENTS).map((d) => ({
        id: d.role,
        permissions: "3072",
      })),
    ]);
  if (path.includes("/channels/"))
    return Response.json({
      id: path.split("/").at(-1),
      type: 0,
      permission_overwrites: [],
    });
  throw Error("E2E blocked unexpected external network request");
});
const discord = {
  isReady: () => true,
  channels: { fetch: async () => null },
} as unknown as Client;
const app = await createHttp(config, db, discord, { rateLimitMax: 2000 });
// Control endpoints bind loopback on this test server only; proxy forbids these paths.
app.post("/__test/revoke", async () => {
  revoked = true;
  return { ok: true };
});
app.post("/__test/reset", async () => {
  revoked = false;
  return { ok: true };
});
for (let i = 0; i < 4; i++)
  await db.query(
    "INSERT INTO reports(department,source,title,description,external_key,discord_channel_id,publication_status,project) VALUES($1,'manual',$2,'Registro simulado para pruebas visuales',$3,$4,'indexed','TFL Studio') ON CONFLICT(external_key) DO NOTHING",
    [
      i % 2 ? "hosting" : "network",
      [
        "Migración del Core a Bun",
        "Revisión de infraestructura",
        "Avances del dashboard",
        "Verificación de permisos",
      ][i],
      "e2e-fixture:" + i,
      i % 2 ? IDS.channels.hosting : IDS.channels.network,
    ],
  );
await db.query(
  "INSERT INTO worker_heartbeats(component,last_seen_at,state) VALUES('jobs',now(),'idle') ON CONFLICT(component) DO UPDATE SET last_seen_at=now(),state='idle'",
);
await app.listen({ host: "127.0.0.1", port: 19081 });
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await db.end();
  process.exit();
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
