import "dotenv/config";
import { openDb, transaction } from "./index.js";
import { readdir, readFile } from "node:fs/promises";

export async function migrate(
  databaseUrl = process.env.DATABASE_URL,
): Promise<void> {
  if (!databaseUrl) throw new Error("DATABASE_URL is required for migrations");
  const db = openDb({ DATABASE_URL: databaseUrl });
  try {
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const files = (
      await readdir(new URL("../../../migrations/", import.meta.url))
    )
      .filter((x) => x.endsWith(".sql"))
      .sort();
    for (const file of files) {
      await transaction(db, async (c) => {
        await c.query("SELECT pg_advisory_xact_lock(77411902)");
        const exists = await c.query(
          "SELECT 1 FROM schema_migrations WHERE id=$1",
          [file],
        );
        if (exists.rowCount) return;
        await c.query(
          await readFile(
            new URL("../../../migrations/" + file, import.meta.url),
            "utf8",
          ),
        );
        await c.query("INSERT INTO schema_migrations(id) VALUES($1)", [file]);
        process.stdout.write("Migrated " + file + "\n");
      });
    }
  } finally {
    await db.end();
  }
}
if (
  process.argv[1]?.endsWith("migrate.ts") ||
  process.argv[1]?.endsWith("migrate.js")
) {
  migrate().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
