import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import type { Config } from "./config.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";

const id = z.object({ id: z.coerce.number().int().positive() });
const page = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
const date = z.string().datetime();
const currency = z.string().regex(/^[A-Z]{3}$/);
const money = z.number().int().safe();
const record = z.object({
  label: z.string().trim().min(1).max(160),
  amountMinor: money,
  currency,
  category: z.string().trim().min(1).max(100),
  dueAt: date.nullable().default(null),
  notes: z.string().max(1000).default(""),
  status: z.enum(["active", "archived", "void"]).default("active"),
});
const subscription = z.object({
  label: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(120),
  amountMinor: money,
  currency,
  cadenceMonths: z.number().int().min(1).max(120),
  nextDueAt: date,
  notes: z.string().max(1000).default(""),
  status: z.enum(["active", "paused", "cancelled"]).default("active"),
});
const fail = (message: string, statusCode = 409) =>
  Object.assign(new Error(message), { statusCode });
type Row = { id: string; version: number; [k: string]: unknown };
async function saveHistory(
  client: import("pg").PoolClient,
  kind: "record" | "subscription",
  idValue: string,
  version: number,
  action: string,
  before: unknown,
  after: unknown,
  actorId: string,
): Promise<void> {
  await client.query(
    "INSERT INTO billing_change_history(resource_kind,resource_id,version,action,previous,current,actor_id) " +
      "VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      kind,
      idValue,
      version,
      action,
      before === null ? null : JSON.stringify(before),
      after === null ? null : JSON.stringify(after),
      actorId,
    ],
  );
  await client.query(
    "INSERT INTO audit_events(actor_id,action,target_kind,target_id) VALUES($1,$2,$3,$4)",
    [actorId, "billing." + kind + "." + action, "billing_" + kind, idValue],
  );
}
export async function registerBillingRoutes(
  app: FastifyInstance,
  db: DB,
  config: Config,
): Promise<void> {
  app.get("/api/v1/billing", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page
      .extend({
        category: z.string().max(100).optional(),
        currency: currency.optional(),
        status: z.enum(["active", "archived", "void"]).optional(),
        search: z.string().max(120).optional(),
        from: date.optional(),
        to: date.optional(),
      })
      .parse(req.query);
    const result = await db.query(
      "SELECT * FROM billing_records WHERE ($1::text IS NULL OR category=$1) AND ($2::text IS NULL OR currency=$2) " +
        "AND ($3::text IS NULL OR status=$3) AND ($4::text IS NULL OR label ILIKE '%'||$4||'%') " +
        "AND ($5::timestamptz IS NULL OR due_at >=$5) AND ($6::timestamptz IS NULL OR due_at <=$6) " +
        "ORDER BY id DESC LIMIT $7 OFFSET $8",
      [
        q.category ?? null,
        q.currency ?? null,
        q.status ?? null,
        q.search ?? null,
        q.from ?? null,
        q.to ?? null,
        q.limit,
        q.offset,
      ],
    );
    return { items: result.rows, ...q };
  });
  app.post("/api/v1/billing", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const d = record.parse(req.body);
    const result = await transaction(db, async (c) => {
      const created = await c.query<Row>(
        "INSERT INTO billing_records(label,amount_minor,currency,category,due_at,notes,status,created_by,updated_by) " +
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *",
        [
          d.label,
          d.amountMinor,
          d.currency,
          d.category,
          d.dueAt,
          d.notes,
          d.status,
          actor.userId,
        ],
      );
      const row = created.rows[0]!;
      await saveHistory(
        c,
        "record",
        row.id,
        row.version,
        "create",
        null,
        row,
        actor.userId,
      );
      return row;
    });
    return { id: result.id, version: result.version };
  });
  app.get("/api/v1/billing/:id", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: recordId } = id.parse(req.params);
    const row = await db.query("SELECT * FROM billing_records WHERE id=$1", [
      recordId,
    ]);
    if (!row.rows[0]) throw fail("Billing record not found", 404);
    return { item: row.rows[0] };
  });
  app.patch("/api/v1/billing/:id", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: recordId } = id.parse(req.params);
    const d = record
      .extend({
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(req.body);
    const current = await transaction(db, async (c) => {
      const previous = await c.query<Row>(
        "SELECT * FROM billing_records WHERE id=$1 FOR UPDATE",
        [recordId],
      );
      const prior = previous.rows[0];
      if (!prior) throw fail("Record not found", 404);
      if (prior.version !== d.expectedVersion)
        throw fail("Billing record edited concurrently");
      const updated = await c.query<Row>(
        "UPDATE billing_records SET label=$2,amount_minor=$3,currency=$4,category=$5,due_at=$6," +
          "notes=$7,status=$8,version=version+1,updated_by=$9,updated_at=now() WHERE id=$1 RETURNING *",
        [
          recordId,
          d.label,
          d.amountMinor,
          d.currency,
          d.category,
          d.dueAt,
          d.notes,
          d.status,
          actor.userId,
        ],
      );
      const next = updated.rows[0]!;
      await saveHistory(
        c,
        "record",
        next.id,
        next.version,
        "update",
        prior,
        next,
        actor.userId,
      );
      return next;
    });
    await audit(
      db,
      "billing.record.reason",
      actor.userId,
      "billing_record",
      String(recordId),
      { reason: d.reason },
    );
    return { ok: true, version: current.version };
  });
  app.get("/api/v1/billing/subscriptions", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page
      .extend({
        status: z.enum(["active", "paused", "cancelled"]).optional(),
        currency: currency.optional(),
        provider: z.string().max(120).optional(),
        from: date.optional(),
        to: date.optional(),
      })
      .parse(req.query);
    const result = await db.query(
      "SELECT * FROM billing_subscriptions WHERE ($1::text IS NULL OR status=$1) " +
        "AND ($2::text IS NULL OR currency=$2) AND ($3::text IS NULL OR provider=$3) " +
        "AND ($4::timestamptz IS NULL OR next_due_at >=$4) AND ($5::timestamptz IS NULL OR next_due_at <=$5) " +
        "ORDER BY next_due_at,id LIMIT $6 OFFSET $7",
      [
        q.status ?? null,
        q.currency ?? null,
        q.provider ?? null,
        q.from ?? null,
        q.to ?? null,
        q.limit,
        q.offset,
      ],
    );
    return { items: result.rows, ...q };
  });
  app.post("/api/v1/billing/subscriptions", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const d = subscription.parse(req.body);
    const row = await transaction(db, async (c) => {
      const inserted = await c.query<Row>(
        "INSERT INTO billing_subscriptions(label,provider,amount_minor,currency,cadence_months,next_due_at,notes,status,created_by,updated_by) " +
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *",
        [
          d.label,
          d.provider,
          d.amountMinor,
          d.currency,
          d.cadenceMonths,
          d.nextDueAt,
          d.notes,
          d.status,
          actor.userId,
        ],
      );
      const created = inserted.rows[0]!;
      await saveHistory(
        c,
        "subscription",
        created.id,
        created.version,
        "create",
        null,
        created,
        actor.userId,
      );
      return created;
    });
    return { id: row.id, version: row.version };
  });
  app.get("/api/v1/billing/subscriptions/due", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { through } = z.object({ through: date }).parse(req.query);
    const rows = await db.query(
      "SELECT * FROM billing_subscriptions WHERE status='active' AND next_due_at<=$1 ORDER BY next_due_at",
      [through],
    );
    return { items: rows.rows, through, basis: "recorded_due_dates_only" };
  });
  app.get("/api/v1/billing/subscriptions/:id", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const { id: subscriptionId } = id.parse(req.params);
    const rows = await db.query(
      "SELECT * FROM billing_subscriptions WHERE id=$1",
      [subscriptionId],
    );
    if (!rows.rows[0]) throw fail("Subscription not found", 404);
    return { item: rows.rows[0] };
  });
  app.patch("/api/v1/billing/subscriptions/:id", async (req) => {
    const actor = await requireUser(req, db, config, {
      admin: true,
      mutation: true,
    });
    const { id: subscriptionId } = id.parse(req.params);
    const d = subscription
      .extend({
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(5).max(500),
      })
      .parse(req.body);
    const newVersion = await transaction(db, async (c) => {
      const result = await c.query<Row>(
        "SELECT * FROM billing_subscriptions WHERE id=$1 FOR UPDATE",
        [subscriptionId],
      );
      const old = result.rows[0];
      if (!old) throw fail("Subscription not found", 404);
      if (old.version !== d.expectedVersion)
        throw fail("Subscription updated concurrently");
      const rows = await c.query<Row>(
        "UPDATE billing_subscriptions SET label=$2,provider=$3,amount_minor=$4,currency=$5,cadence_months=$6," +
          "next_due_at=$7,notes=$8,status=$9,version=version+1,updated_by=$10,updated_at=now() WHERE id=$1 RETURNING *",
        [
          subscriptionId,
          d.label,
          d.provider,
          d.amountMinor,
          d.currency,
          d.cadenceMonths,
          d.nextDueAt,
          d.notes,
          d.status,
          actor.userId,
        ],
      );
      const newRow = rows.rows[0]!;
      await saveHistory(
        c,
        "subscription",
        newRow.id,
        newRow.version,
        "update",
        old,
        newRow,
        actor.userId,
      );
      return newRow.version;
    });
    await audit(
      db,
      "billing.subscription.reason",
      actor.userId,
      "billing_subscription",
      String(subscriptionId),
      { reason: d.reason },
    );
    return { ok: true, version: newVersion };
  });
  app.get("/api/v1/billing/history", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = page
      .extend({
        kind: z.enum(["record", "subscription"]),
        id: z.coerce.number().int().positive(),
      })
      .parse(req.query);
    const history = await db.query(
      "SELECT * FROM billing_change_history WHERE resource_kind=$1 AND resource_id=$2 ORDER BY id DESC LIMIT $3 OFFSET $4",
      [q.kind, q.id, q.limit, q.offset],
    );
    return { items: history.rows, ...q };
  });
  app.get("/api/v1/billing/summary", async (req) => {
    await requireUser(req, db, config, { admin: true });
    const q = z
      .object({ from: date.optional(), to: date.optional() })
      .parse(req.query);
    const byCurrency = await db.query(
      "SELECT currency,category,status,count(*)::int AS entries,sum(amount_minor)::text AS amount_minor_total " +
        "FROM billing_records WHERE ($1::timestamptz IS NULL OR created_at >=$1) " +
        "AND ($2::timestamptz IS NULL OR created_at <=$2) " +
        "GROUP BY currency,category,status ORDER BY currency,category,status",
      [q.from ?? null, q.to ?? null],
    );
    return {
      groups: byCurrency.rows,
      precision: "exact_integer_minor_units",
      coverage: "declared_records_only",
      exchangeRatesApplied: false,
      note: "Currencies are not combined or converted",
    };
  });
}
