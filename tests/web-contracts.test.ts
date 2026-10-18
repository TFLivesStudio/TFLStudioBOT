import { withFetchExtras } from "./helpers/fetch.js";
import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  sections,
  initialValues,
  actionPath,
} from "../apps/web/lib/modules.js";
import { proxyCore } from "../apps/web/lib/proxy.js";
import { preferencesSchema, visualSchema, reportSchema } from "@tfl/shared";
import { createHttp } from "../apps/core/src/http.js";
import { IDS } from "@tfl/shared";
import type { DB } from "../apps/core/src/db.js";
import type { Config } from "@tfl/config";
import type { Client } from "discord.js";
test("every dashboard read and write points to a registered Core route", async () => {
  const app = await createHttp(
    { LOG_LEVEL: "silent", CORS_ORIGIN: "http://localhost:3000" } as Config,
    { query: async () => ({ rows: [] }) } as unknown as DB,
    { isReady: () => true } as unknown as Client,
  );
  try {
    for (const section of sections)
      for (const tab of section.tabs ?? []) {
        assert.ok(
          app.hasRoute({ method: "GET", url: "/api/v1" + tab.path }),
          tab.path,
        );
        for (const action of [
          ...(tab.create ? [tab.create] : []),
          ...(tab.actions ?? []),
          ...(tab.tools ?? []),
        ]) {
          const url = ("/api/v1" + action.path)
            .split("?")[0]!
            .replace(":release_id", ":id")
            .replace(":user_id", ":userId");
          assert.ok(
            app.hasRoute({
              method: action.read ? "GET" : (action.method ?? "POST"),
              url,
            }),
            action.label + " " + url,
          );
        }
      }
  } finally {
    await app.close();
  }
});
test("forms preserve versions, integers, visibility, source toggles and typed automation configs", () => {
  const guide = sections
    .find((s) => s.key === "guides")!
    .tabs![0]!.actions!.find((a) => a.label === "Editar")!;
  const v = initialValues(guide, {
    version: 7,
    visibility_department: "hosting",
    title: "Guide",
    category: "Help",
    body: "A",
  });
  assert.equal(v.expectedVersion, 7);
  assert.equal(v.visibilityDepartment, "hosting");
  const billing = sections.find((s) => s.key === "billing")!.tabs![0]!.create!;
  assert.equal(
    billing.build!({ currency: "cop", amountMinor: 100099 }, {}).amountMinor,
    100099,
  );
  const auto = sections.find((s) => s.key === "automations")!.tabs![0]!.create!;
  const config = auto.build!(
    {
      name: "Example",
      kind: "maintenance",
      triggerKind: "manual",
      intervalMinutes: 99,
      message: "ignored",
    },
    {},
  );
  assert.deepEqual(config.config, { operation: "prune_expired_sessions" });
  assert.equal(config.intervalMinutes, null);
  assert.equal(
    actionPath(
      {
        label: "commits",
        path: "/github/releases/:release_id/commits?repository=:repository",
      },
      { release_id: 4, repository: "owner/repo" },
    ),
    "/github/releases/4/commits?repository=owner%2Frepo",
  );
  assert.equal(preferencesSchema.safeParse({ theme: "evil" }).success, false);
  assert.equal(
    reportSchema.safeParse({
      department: "unknown",
      title: "a",
      description: "b",
    }).success,
    false,
  );
  assert.equal(
    visualSchema.safeParse({ embeds: [{ image: "http://evil.example/a.png" }] })
      .success,
    false,
  );
});
test("BFF forwards only session cookies and allowed headers, preserves OAuth cookies and rejects unsafe requests", async () => {
  const original = globalThis.fetch;
  const before = {
    core: process.env.CORE_INTERNAL_URL,
    web: process.env.WEB_ORIGIN,
  };
  process.env.CORE_INTERNAL_URL = "http://127.0.0.1:8080";
  process.env.WEB_ORIGIN = "https://studio.example";
  const seen: { url?: string; headers?: Headers; body?: unknown } = {};
  globalThis.fetch = withFetchExtras(async (input, init) => {
    seen.url = String(input);
    seen.headers = new Headers(init?.headers);
    seen.body = init?.body;
    return new Response("{}", {
      headers: [
        ["set-cookie", "tfl_studio_session=test; Path=/; HttpOnly"],
        ["set-cookie", "tfl_oauth_state=; Max-Age=0; Path=/; HttpOnly"],
      ],
    });
  });
  try {
    const res = await proxyCore(
      new Request("https://studio.example/api/v1/reports?search=abc", {
        method: "POST",
        headers: {
          origin: "https://studio.example",
          cookie: "unrelated=secret; tfl_studio_session=test",
          "x-csrf-token": "csrf",
          "idempotency-key": "unique1234",
          authorization: "Bearer DO_NOT_FORWARD",
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(seen.url, "http://127.0.0.1:8080/api/v1/reports?search=abc");
    assert.equal(seen.headers?.get("cookie"), "tfl_studio_session=test");
    assert.equal(seen.headers?.get("authorization"), null);
    assert.equal(seen.headers?.get("origin"), "https://studio.example");
    assert.equal(seen.headers?.get("x-csrf-token"), "csrf");
    assert.equal(res.headers.getSetCookie().length, 2);
    assert.match(res.headers.get("cache-control")!, /no-store/);
    assert.equal(
      (
        await proxyCore(
          new Request("https://studio.example/api/v1/reports", {
            method: "POST",
            headers: { origin: "https://evil.example" },
          }),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await proxyCore(
          new Request(
            "https://studio.example/api/v1/integrations/github/webhook",
          ),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await proxyCore(
          new Request("https://studio.example/api/v1/reports%2f..%2fauth"),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await proxyCore(
          new Request("https://studio.example/api/v1/reports", {
            method: "POST",
            headers: { origin: "https://studio.example" },
            body: "x".repeat(1024 * 1024 + 1),
          }),
        )
      ).status,
      413,
    );
  } finally {
    globalThis.fetch = original;
    if (before.core) process.env.CORE_INTERNAL_URL = before.core;
    else delete process.env.CORE_INTERNAL_URL;
    if (before.web) process.env.WEB_ORIGIN = before.web;
    else delete process.env.WEB_ORIGIN;
  }
});
test("staff assignment rejects self and unapproved members, role lookup fails closed", async () => {
  const original = globalThis.fetch;
  const token = "assignment-test";
  const secret = "assignment-testing-secret-0123456789";
  const { csrfToken } = await import("../apps/core/src/auth.js");
  const { createHash } = await import("node:crypto");
  let pending = false;
  globalThis.fetch = withFetchExtras(async (input) =>
    Response.json({
      roles: [IDS.admin],
      pending: String(input).endsWith("/333333333333333333") ? pending : false,
    }),
  );
  const csrf = csrfToken(token, secret);
  const hash = createHash("sha256").update(csrf).digest("hex");
  const db = {
    query: async (sql: string) =>
      sql.includes("FROM sessions")
        ? { rows: [{ user_id: "111111111111111111", csrf_hash: hash }] }
        : { rows: [], rowCount: 0 },
  } as unknown as DB;
  const app = await createHttp(
    {
      LOG_LEVEL: "silent",
      CORS_ORIGIN: "http://localhost:3000",
      SESSION_SECRET: secret,
      ADMIN_ROLE_ID: IDS.admin,
      DISCORD_GUILD_ID: IDS.guild,
    } as Config,
    db,
    {} as Client,
  );
  const send = (userId: string) =>
    app.inject({
      method: "PUT",
      url: "/api/v1/staff/assignments",
      headers: {
        cookie: "tfl_studio_session=" + token,
        origin: "http://localhost:3000",
        "x-csrf-token": csrf,
      },
      payload: { userId, department: "hosting" },
    });
  try {
    assert.equal((await send("111111111111111111")).statusCode, 403);
    pending = true;
    assert.equal((await send("333333333333333333")).statusCode, 409);
  } finally {
    await app.close();
    globalThis.fetch = original;
  }
});
test("queued publications recheck live approval and roles before external writes", async () => {
  const { authorizePublisher } = await import("../apps/core/src/jobs.js");
  const original = globalThis.fetch;
  const config = {
    ADMIN_ROLE_ID: IDS.admin,
    DISCORD_GUILD_ID: IDS.guild,
  } as Config;
  let roles = [IDS.admin as string],
    pending = false;
  globalThis.fetch = withFetchExtras(async () =>
    Response.json({ roles, pending }),
  );
  try {
    await authorizePublisher(config, "111111111111111111");
    roles = [];
    await assert.rejects(
      authorizePublisher(config, "111111111111111111"),
      /revoked/,
    );
    pending = true;
    await assert.rejects(
      authorizePublisher(config, "111111111111111111"),
      /approved/,
    );
    await assert.rejects(authorizePublisher(config, null), /unknown/);
  } finally {
    globalThis.fetch = original;
  }
});
test("worker shutdown drains an in-flight claim before returning", async () => {
  const { launchWorker } = await import("../apps/core/src/jobs.js");
  let release: () => void = () => {};
  let entered: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  const started = new Promise<void>((r) => (entered = r));
  const query = async (sql: string) => {
    if (sql.startsWith("UPDATE automation_jobs SET status='running'")) {
      entered();
      await gate;
    }
    return { rows: [], rowCount: 0 };
  };
  const db = {
    query,
    connect: async () => ({ query, release: () => {} }),
  } as unknown as DB;
  const stop = launchWorker(
    db,
    { isReady: () => true } as unknown as Client,
    {} as Config,
  );
  await started;
  let complete = false;
  const draining = stop().then(() => {
    complete = true;
  });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(complete, false);
  release();
  await draining;
  assert.equal(complete, true);
});
