import type { DB } from "./db.js";
export async function audit(db: DB, action: string, actor: string | null, kind: string, id: string | null, meta: Record<string, unknown> = {}): Promise<void> {
  await db.query("INSERT INTO audit_events(actor_id,action,target_kind,target_id,meta) VALUES ($1,$2,$3,$4,$5)", [actor, action, kind, id, JSON.stringify(meta)]);
}
