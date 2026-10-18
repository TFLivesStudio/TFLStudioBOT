/** Synthetic public liveness benchmark, never connects to Discord or PostgreSQL. */
import type { DB } from "../apps/core/src/db.js";
import type { Config } from "@tfl/config";
import type { Client } from "discord.js";
const started = performance.now();
const { createHttp } = (await import(
  process.env.TFL_BENCH_CORE_SOURCE ?? "../apps/core/src/http.js"
)) as typeof import("../apps/core/src/http.js");
const app = await createHttp(
  { LOG_LEVEL: "silent", CORS_ORIGIN: "http://localhost:3000" } as Config,
  { query: async () => ({ rows: [] }) } as unknown as DB,
  { isReady: () => true } as unknown as Client,
);
await app.listen({ host: "127.0.0.1", port: 0 });
const startupMs = performance.now() - started;
const url = app.listeningOrigin + "/api/v1/health/live";
try {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(url);
    await res.text();
  }
  const latencies: number[] = [];
  for (let i = 0; i < 200; i++) {
    const time = performance.now();
    const res = await fetch(url);
    await res.text();
    latencies.push(performance.now() - time);
  }
  const idleCpu = process.cpuUsage();
  await new Promise((r) => setTimeout(r, 500));
  const cpu = process.cpuUsage(idleCpu);
  latencies.sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        kind: "synthetic_liveness_no_discord_no_postgresql",
        runtime: process.versions.bun
          ? "Bun " + process.versions.bun
          : "Node " + process.version,
        startupMs: Math.round(startupMs * 100) / 100,
        rssMiB:
          Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100,
        idleCpuMsPer500Ms: (cpu.user + cpu.system) / 1000,
        requests: 200,
        p50Ms: Math.round(latencies[100]! * 1000) / 1000,
        p95Ms: Math.round(latencies[190]! * 1000) / 1000,
      },
      null,
      2,
    ),
  );
} finally {
  await app.close();
}
