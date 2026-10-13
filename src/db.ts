import pg from "pg";
import type { Config } from "./config.js";
const { Pool } = pg;
export type DB = pg.Pool;
export function openDb(config: Config): DB {
  return new Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
}
export async function verifySchema(db: DB): Promise<void> {
  const check=await db.query("SELECT 1 FROM schema_migrations WHERE id=$1",["009_github_commit_associations.sql"]);
  if(!check.rowCount)throw new Error("Database migrations incomplete: run npm run migrate");
}
export async function transaction<T>(db: DB, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const value = await fn(client);
    await client.query("COMMIT");
    return value;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally { client.release(); }
}
