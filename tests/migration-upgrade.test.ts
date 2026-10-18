import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFile, readdir } from "node:fs/promises";
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";
import { migrate } from "@tfl/database/migrate";
test("the thirteen historical SQL migrations are byte-identical to v0.3.0", async () => {
  const baseline = JSON.parse(
    await readFile(
      new URL("../docs/BASELINE_MIGRATIONS.json", import.meta.url),
      "utf8",
    ),
  ) as { sha256: Record<string, string> };
  assert.equal(Object.keys(baseline.sha256).length, 13);
  for (const [file, expected] of Object.entries(baseline.sha256)) {
    const raw = await readFile(
      new URL("../migrations/" + file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(raw).digest("hex"),
      expected,
      file,
    );
  }
});
const url = process.env.TEST_DATABASE_URL;
const enabled = Boolean(
  url &&
  new URL(url).pathname === "/studio_test" &&
  process.env.NODE_ENV === "test",
);
test(
  "v0.3 data survives upgrade, migration runner is idempotent and needs no bot credentials",
  { skip: !enabled },
  async () => {
    const schema = "upgrade_" + randomBytes(8).toString("hex");
    const db = new pg.Client({ connectionString: url! });
    await db.connect();
    try {
      await db.query(`CREATE SCHEMA ${schema}`);
      await db.query(`SET search_path TO ${schema}`);
      await db.query(
        "CREATE TABLE schema_migrations(id text PRIMARY KEY,applied_at timestamptz DEFAULT now())",
      );
      const files = (await readdir(new URL("../migrations/", import.meta.url)))
        .filter((f) => f.endsWith(".sql") && !f.startsWith("014"))
        .sort();
      for (const file of files) {
        await db.query(
          await readFile(
            new URL("../migrations/" + file, import.meta.url),
            "utf8",
          ),
        );
        await db.query("INSERT INTO schema_migrations(id) VALUES($1)", [file]);
      }
      await db.query(
        "INSERT INTO guides(category,title,body,updated_by) VALUES('Legacy','Original guide','Keep body','111111111111111111')",
      );
      await db.query(
        "INSERT INTO billing_records(label,amount_minor,currency,category,created_by) VALUES('Legacy',9007199254740991,'COP','Test','111111111111111111')",
      );
      await db.query(
        "INSERT INTO reports(department,source,title,description,discord_channel_id) VALUES('hosting','manual','Original report','Keep description','1517346957671137310')",
      );
      const target = new URL(url!);
      target.searchParams.set("options", "-csearch_path=" + schema);
      await migrate(target.toString());
      await migrate(target.toString());
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM schema_migrations"))
          .rows[0].n,
        14,
      );
      assert.equal(
        (await db.query("SELECT body FROM guides")).rows[0].body,
        "Keep body",
      );
      assert.equal(
        (
          await db.query(
            "SELECT amount_minor::text amount FROM billing_records",
          )
        ).rows[0].amount,
        "9007199254740991",
      );
      assert.equal(
        (await db.query("SELECT description FROM reports")).rows[0].description,
        "Keep description",
      );
      assert.equal(
        (await db.query("SELECT count(*)::int n FROM announcement_revisions"))
          .rows[0].n,
        0,
        "No fabricated historical revisions",
      );
    } finally {
      await db.query("SET search_path TO public");
      await db.query(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  },
);
