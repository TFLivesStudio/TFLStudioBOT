import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import type { Client } from "discord.js";
import { audit } from "./audit.js";
import { beginOAuth,completeOAuth,requireUser,refreshCsrf,logout,isAdmin } from "./auth.js";
import { DEPARTMENTS, IDS, type DepartmentKey } from "./ids.js";
import { createReport } from "./reports.js";
import { verifyGitHubSignature,handleGithubEvent } from "./github.js";
import { OPENAPI } from "./openapi.js";
import { visualSchema } from "./presentation.js";
import { transaction } from "./db.js";
import { getStaffMember } from "./staff.js";
import { canUseChannel,visibleDepartments } from "./permissions.js";
import { registerJobAdmin } from "./job-admin.js";
import { registerIndexRoutes } from "./index-routes.js";
import { registerAuditorRoutes } from "./auditor-routes.js";

const departmentSchema=z.enum(Object.keys(DEPARTMENTS) as [DepartmentKey,...DepartmentKey[]]);
const text=z.string().trim().min(1);
const idSchema=z.coerce.number().int().positive();
const page=z.object({limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).default(0)});
function query<T extends z.ZodTypeAny>(schema:T,value:unknown):z.infer<T> {return schema.parse(value);}
export async function createHttp(config:Config,db:DB,discord:Client):Promise<FastifyInstance>{
  const app=Fastify({logger:{level:config.LOG_LEVEL},bodyLimit:1024*1024,trustProxy:false});
  await app.register(cors,{origin:config.CORS_ORIGIN,credentials:true,methods:["GET","HEAD","POST","PATCH","PUT","DELETE"],allowedHeaders:["Content-Type","X-CSRF-Token","Idempotency-Key"]});
  await app.register(rateLimit,{max:100,timeWindow:"1 minute"});
  app.addHook("onRequest", async(req,reply)=>{
    if (["POST","PUT","PATCH","DELETE"].includes(req.method) && !req.url.startsWith("/api/v1/integrations/github/webhook")) {
      // OAuth callback is GET. Browser mutations must have the exact approved Origin.
      if(req.headers.origin !== config.CORS_ORIGIN) return reply.code(403).send({error:{code:"ORIGIN_FORBIDDEN",message:"Origin not allowed"}});
    }
  });
  app.setErrorHandler((error,req,reply)=>{
    const status= error instanceof z.ZodError?400: ((error as {statusCode?:number}).statusCode ?? 500);
    if(status>=500) req.log.error({err:error}, "request_failed");
    reply.code(status).send({error:{code:status===401?"UNAUTHENTICATED":status===403?"FORBIDDEN":status===400?"INVALID_REQUEST":"INTERNAL_ERROR",message:status>=500?"Internal server error":(error instanceof Error?error.message:"Invalid request")}});
  });
  app.get("/api/v1/health/live",async()=>({status:"ok"}));
  app.get("/api/v1/health/ready",async(req,reply)=>{
    try {await db.query("SELECT 1");if(!discord.isReady()) throw new Error("Gateway disconnected");return {status:"ready",gateway:true};}
    catch{return reply.code(503).send({status:"unavailable"});}
  });
  app.get("/api/v1/openapi.json",async()=>OPENAPI);
  app.get("/api/v1/auth/login",async(req,reply)=>beginOAuth(reply,config));
  app.get("/api/v1/auth/callback",async(req,reply)=>{
    const params=query(z.object({code:z.string().min(1),state:z.string().min(1)}),req.query);
    await completeOAuth(req,reply,config,db,params.code,params.state);
  });
  app.get("/api/v1/auth/me",async(req)=>{
    const actor=await requireUser(req,db,config);
    return {userId:actor.userId,admin:isAdmin(actor,config),departments:await visibleDepartments(config,actor),csrfToken:refreshCsrf(db,req,config)};
  });
  app.post("/api/v1/auth/logout",async(req,reply)=>{
    await requireUser(req,db,config,{mutation:true});
    await logout(req,reply,db,config);
    return {ok:true};
  });
  app.get("/api/v1/departments",async(req)=>{
    const actor=await requireUser(req,db,config);
    return {items:await visibleDepartments(config,actor)};
  });
  app.get("/api/v1/reports",async(req)=>{
    const actor=await requireUser(req,db,config);
    const q=query(page.extend({department:departmentSchema.optional(),search:z.string().max(120).optional()}),req.query);
    const allowed=await visibleDepartments(config,actor);
    if(q.department && !allowed.includes(q.department)) throw Object.assign(new Error("Forbidden"),{statusCode:403});
    const selected=q.department?[q.department]:allowed;
    const result=await db.query("SELECT id,department,source,title,description,created_by,discord_channel_id,discord_message_id,discord_thread_id,created_at FROM reports WHERE department=ANY($1::text[]) AND ($2::text IS NULL OR title ILIKE '%'||$2||'%' OR description ILIKE '%'||$2||'%') ORDER BY created_at DESC LIMIT $3 OFFSET $4",[selected,q.search??null,q.limit,q.offset]);
    return {items:result.rows,limit:q.limit,offset:q.offset};
  });
  app.post("/api/v1/reports",async(req)=>{
    const actor=await requireUser(req,db,config,{mutation:true});
    const input=query(z.object({department:departmentSchema,title:text.max(100),description:text.max(1500)}),req.body);
    if(!await canUseChannel(config,actor,input.department,"write")) throw Object.assign(new Error("Forbidden"),{statusCode:403});
    const key=req.headers["idempotency-key"];
    if(typeof key!=="string" || !/^[\w-]{8,128}$/.test(key)) throw Object.assign(new Error("Idempotency-Key header required"),{statusCode:400});
    const result=await createReport(db,discord,input.department,input.title,input.description,actor.userId,"api:"+actor.userId+":"+key);
    await audit(db,"report.create",actor.userId,"report",result.id,{department:input.department});
    return result;
  });
  app.get("/api/v1/publications",async(req)=>{
    const actor=await requireUser(req,db,config,{department:"publicidad"});
    const q=query(page,req.query);
    const out=await db.query("SELECT * FROM publication_records ORDER BY published_at DESC LIMIT $1 OFFSET $2",[q.limit,q.offset]);
    return {items:out.rows,...q};
  });
  app.post("/api/v1/publications",async(req)=>{
    const actor=await requireUser(req,db,config,{department:"publicidad",mutation:true});
    const data=query(z.object({project:text.max(120),platform:text.max(70),url:z.string().url().max(1500),publishedAt:z.string().datetime(),notes:z.string().max(2000).default("")}),req.body);
    const saved=await db.query<{id:string}>("INSERT INTO publication_records(project,platform,url,published_at,submitted_by,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[data.project,data.platform,data.url,data.publishedAt,actor.userId,data.notes]);
    await audit(db,"publication.create",actor.userId,"publication",saved.rows[0]!.id);
    return {id:saved.rows[0]!.id};
  });

  app.get("/api/v1/publications/stats",async(req)=>{
    await requireUser(req,db,config,{department:"publicidad"});
    const rows=await db.query("SELECT platform,count(*)::int AS total FROM publication_records GROUP BY platform ORDER BY total DESC");
    return {items:rows.rows,basis:"self_reported_records",completeFor:"stored_publications_only"};
  });
  app.get("/api/v1/guides",async(req)=>{
    const actor=await requireUser(req,db,config);
    const q=query(page,req.query);
    const allowed=await visibleDepartments(config,actor);
    const result=await db.query("SELECT * FROM guides WHERE visibility_department IS NULL OR visibility_department=ANY($1::text[]) ORDER BY updated_at DESC LIMIT $2 OFFSET $3",[allowed,q.limit,q.offset]);
    return {items:result.rows,...q};
  });
  app.post("/api/v1/guides",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const d=query(z.object({category:text.max(100),title:text.max(160),body:text.max(15000),visibilityDepartment:departmentSchema.nullable().default(null),discordThreadId:z.string().regex(/^\d{17,20}$/).nullable().default(null)}),req.body);
    const saved=await db.query<{id:string}>("INSERT INTO guides(category,title,body,visibility_department,discord_thread_id,updated_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[d.category,d.title,d.body,d.visibilityDepartment,d.discordThreadId,actor.userId]);
    await audit(db,"guide.create",actor.userId,"guide",saved.rows[0]!.id);
    return {id:saved.rows[0]!.id};
  });

  app.get("/api/v1/reports/:id",async(req)=>{
    const actor=await requireUser(req,db,config);
    const id=query(z.object({id:idSchema}),req.params).id;
    const item=await db.query<{department:DepartmentKey}>("SELECT * FROM reports WHERE id=$1",[id]);
    const record=item.rows[0];
    if(!record)throw Object.assign(new Error("Report not found"),{statusCode:404});
    if(!await canUseChannel(config,actor,record.department,"read"))throw Object.assign(new Error("Forbidden"),{statusCode:403});
    return {item:record};
  });
  app.get("/api/v1/guides/:id/revisions",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const id=query(z.object({id:idSchema}),req.params).id;
    return {items:(await db.query("SELECT version,title,body,category,visibility_department,edited_by,edited_at FROM guide_revisions WHERE guide_id=$1 ORDER BY version DESC",[id])).rows};
  });
  app.get("/api/v1/staff/members/:id",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const id=query(z.object({id:z.string().regex(/^\d{17,20}$/)}),req.params).id;
    const member=await getStaffMember(config,id);
    if(!member)throw Object.assign(new Error("Member not found"),{statusCode:404});
    return {item:member};
  });
  app.get("/api/v1/staff/directory",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const rows=await db.query<{user_id:string;department:string;assigned_at:Date}>(
      "SELECT user_id,department,assigned_at FROM staff_assignments ORDER BY assigned_at DESC LIMIT 100"
    );
    const unique=[...new Set(rows.rows.map(row=>row.user_id))];
    const members=[];
    for (const id of unique) {
      const member=await getStaffMember(config,id);
      members.push({id,member,assignments:rows.rows.filter(row=>row.user_id===id).map(row=>row.department)});
    }
    return {items:members,complete:false,scope:"recorded_assignments_only",memberTotal:members.length};
  });
  app.get("/api/v1/staff/assignments",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    return {items:(await db.query("SELECT user_id,department,assigned_by,assigned_at FROM staff_assignments ORDER BY assigned_at DESC")).rows};
  });
  app.put("/api/v1/staff/assignments",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const d=query(z.object({userId:z.string().regex(/^\d{17,20}$/),department:departmentSchema}),req.body);
    await db.query("INSERT INTO staff_assignments(user_id,department,assigned_by) VALUES($1,$2,$3) ON CONFLICT(user_id,department) DO UPDATE SET assigned_by=EXCLUDED.assigned_by,assigned_at=now()",[d.userId,d.department,actor.userId]);
    await audit(db,"staff.assign",actor.userId,"user",d.userId,{department:d.department});
    return {ok:true};
  });
  app.get("/api/v1/billing",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const q=query(page,req.query);
    return {items:(await db.query("SELECT * FROM billing_records ORDER BY created_at DESC LIMIT $1 OFFSET $2",[q.limit,q.offset])).rows,...q};
  });
  app.post("/api/v1/billing",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const d=query(z.object({label:text.max(160),amountMinor:z.number().int().safe(),currency:z.string().regex(/^[A-Z]{3}$/),category:text.max(100),dueAt:z.string().datetime().nullable().default(null)}),req.body);
    const saved=await db.query<{id:string}>("INSERT INTO billing_records(label,amount_minor,currency,category,due_at,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[d.label,d.amountMinor,d.currency,d.category,d.dueAt,actor.userId]);
    await audit(db,"billing.create",actor.userId,"billing",saved.rows[0]!.id);
    return {id:saved.rows[0]!.id};
  });

  app.get("/api/v1/billing/subscriptions",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const q=query(page,req.query);
    return {items:(await db.query("SELECT * FROM billing_subscriptions ORDER BY next_due_at ASC LIMIT $1 OFFSET $2",[q.limit,q.offset])).rows,...q};
  });
  app.post("/api/v1/billing/subscriptions",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const d=query(z.object({label:text.max(160),provider:text.max(120),amountMinor:z.number().int().safe(),currency:z.string().regex(/^[A-Z]{3}$/),cadenceMonths:z.number().int().min(1).max(120),nextDueAt:z.string().datetime(),notes:z.string().max(1000).default("")}),req.body);
    const result=await db.query<{id:string}>(
      "INSERT INTO billing_subscriptions(label,provider,amount_minor,currency,cadence_months,next_due_at,notes,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id",
      [d.label,d.provider,d.amountMinor,d.currency,d.cadenceMonths,d.nextDueAt,d.notes,actor.userId]);
    await audit(db,"billing.subscription.create",actor.userId,"billing_subscription",result.rows[0]!.id);
    return {id:result.rows[0]!.id};
  });
  app.patch("/api/v1/billing/subscriptions/:id",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const id=query(z.object({id:idSchema}),req.params).id;
    const d=query(z.object({status:z.enum(["active","paused","cancelled"]),nextDueAt:z.string().datetime()}),req.body);
    const result=await db.query("UPDATE billing_subscriptions SET status=$2,next_due_at=$3,updated_by=$4,updated_at=now() WHERE id=$1 RETURNING id",[id,d.status,d.nextDueAt,actor.userId]);
    if(!result.rowCount)throw Object.assign(new Error("Subscription not found"),{statusCode:404});
    await audit(db,"billing.subscription.update",actor.userId,"billing_subscription",String(id),{status:d.status,nextDueAt:d.nextDueAt});
    return {ok:true};
  });
  app.get("/api/v1/announcements",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const q=query(page,req.query);
    return {items:(await db.query("SELECT * FROM announcements ORDER BY id DESC LIMIT $1 OFFSET $2",[q.limit,q.offset])).rows,...q};
  });
  app.post("/api/v1/announcements",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const d=query(z.object({targetChannelId:z.string().regex(/^\d{17,20}$/),title:text.max(100),body:text.max(1800),visual:visualSchema.default({embeds:[]})}),req.body);
    // Only whitelisted audited announcement channel, never arbitrary channels or @everyone.
    if(d.targetChannelId!==IDS.channels.anuncios) throw Object.assign(new Error("Destination not whitelisted"),{statusCode:400});
    const saved=await db.query<{id:string}>("INSERT INTO announcements(target_channel_id,title,body,author_id,visual_payload) VALUES($1,$2,$3,$4,$5) RETURNING id",[d.targetChannelId,d.title,d.body,actor.userId,JSON.stringify(d.visual)]);
    await audit(db,"announcement.draft",actor.userId,"announcement",saved.rows[0]!.id);
    return {id:saved.rows[0]!.id};
  });
  app.post("/api/v1/announcements/:id/schedule",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const id=query(z.object({id:idSchema}),req.params).id;
    const d=query(z.object({runAt:z.string().datetime(),confirm:z.literal(true)}),req.body);
    await transaction(db,async c=>{
      const data=await c.query("UPDATE announcements SET status='scheduled',scheduled_at=$2 WHERE id=$1 AND status='draft' RETURNING id",[id,d.runAt]);
      if(!data.rowCount) throw Object.assign(new Error("Draft not found"),{statusCode:404});
      await c.query("INSERT INTO automation_jobs(kind,payload,run_at,dedup_key) VALUES('announcement',$1,$2,$3) ON CONFLICT DO NOTHING",[JSON.stringify({id}),d.runAt,"announcement:"+id]);
    });
    await audit(db,"announcement.schedule",actor.userId,"announcement",String(id),{runAt:d.runAt});
    return {ok:true};
  });

  app.get("/api/v1/announcements/:id/preview",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const id=query(z.object({id:idSchema}),req.params).id;
    const data=await db.query("SELECT title,body,visual_payload,status FROM announcements WHERE id=$1",[id]);
    if(!data.rows.length) throw Object.assign(new Error("Draft not found"),{statusCode:404});
    return {preview:data.rows[0],note:"Unpublished, visual data is an API preview, not a Discord render"};
  });
  app.get("/api/v1/announcements/templates",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    return {items:(await db.query("SELECT * FROM announcement_templates ORDER BY name")).rows};
  });
  app.post("/api/v1/announcements/templates",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const d=query(z.object({name:text.max(90),visual:visualSchema}),req.body);
    const result=await db.query<{id:string}>("INSERT INTO announcement_templates(name,visual_payload,created_by) VALUES($1,$2,$3) ON CONFLICT(name) DO UPDATE SET visual_payload=EXCLUDED.visual_payload,updated_at=now() RETURNING id",[d.name,JSON.stringify(d.visual),actor.userId]);
    await audit(db,"template.upsert",actor.userId,"announcement_template",result.rows[0]!.id);
    return {id:result.rows[0]!.id};
  });
  app.patch("/api/v1/guides/:id",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const id=query(z.object({id:idSchema}),req.params).id;
    const d=query(z.object({expectedVersion:z.number().int().positive(),category:text.max(100),title:text.max(160),body:text.max(15000),visibilityDepartment:departmentSchema.nullable()}),req.body);
    const updated=await transaction(db,async c=>{
      const previous=await c.query<{id:string;version:number;title:string;body:string;category:string;visibility_department:string|null}>("SELECT * FROM guides WHERE id=$1 FOR UPDATE",[id]);
      const old=previous.rows[0];
      if(!old) throw Object.assign(new Error("Guide not found"),{statusCode:404});
      if(old.version!==d.expectedVersion) throw Object.assign(new Error("Guide version conflict"),{statusCode:409});
      await c.query("INSERT INTO guide_revisions(guide_id,version,title,body,category,visibility_department,edited_by) VALUES($1,$2,$3,$4,$5,$6,$7)",[id,old.version,old.title,old.body,old.category,old.visibility_department,actor.userId]);
      return c.query("UPDATE guides SET title=$2,body=$3,category=$4,visibility_department=$5,version=version+1,updated_by=$6,updated_at=now() WHERE id=$1 RETURNING id,version",[id,d.title,d.body,d.category,d.visibilityDepartment,actor.userId]);
    });
    await audit(db,"guide.update",actor.userId,"guide",String(id),{version:updated.rows[0]?.version});
    return updated.rows[0];
  });
  app.post("/api/v1/github/sources",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const d=query(z.object({repository:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),department:departmentSchema,defaultBranch:z.string().regex(/^[A-Za-z0-9._/-]{1,100}$/).default("main")}),req.body);
    const result=await db.query<{id:string}>("INSERT INTO github_sources(repository,department,default_branch,enabled) VALUES($1,$2,$3,false) ON CONFLICT(repository) DO NOTHING RETURNING id",[d.repository,d.department,d.defaultBranch]);
    if(!result.rowCount)throw Object.assign(new Error("Repository already configured"),{statusCode:409});
    await audit(db,"github.source.add",actor.userId,"github_source",result.rows[0]!.id,{repo:d.repository});
    return {id:result.rows[0]!.id,enabled:false};
  });
  app.get("/api/v1/github/sources",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    return {items:(await db.query("SELECT * FROM github_sources ORDER BY repository")).rows};
  });
  app.patch("/api/v1/github/sources/:id",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const id=query(z.object({id:idSchema}),req.params).id;
    const d=query(z.object({
      enabled:z.boolean(),pushEnabled:z.boolean(),releaseEnabled:z.boolean(),
      batchMinutes:z.number().int().min(5).max(1440),
      defaultBranch:z.string().regex(/^[A-Za-z0-9._/-]{1,100}$/).optional(),
      allowPrereleases:z.boolean().optional()
    }),req.body);
    const result=await db.query(`UPDATE github_sources SET enabled=$2,push_enabled=$3,release_enabled=$4,batch_minutes=$5,
        default_branch=COALESCE($6,default_branch),
        last_commit_sha=CASE WHEN $6 IS NOT NULL AND $6<>default_branch THEN NULL ELSE last_commit_sha END,
        allow_prereleases=COALESCE($7,allow_prereleases),
        enabled_at=CASE WHEN enabled=false AND $2=true THEN now() ELSE enabled_at END
        WHERE id=$1 RETURNING id`,[id,d.enabled,d.pushEnabled,d.releaseEnabled,d.batchMinutes,d.defaultBranch??null,d.allowPrereleases??null]);
    if(!result.rowCount) throw Object.assign(new Error("Source not found"),{statusCode:404});
    await audit(db,"github.configure",actor.userId,"github_source",String(id));
    return {ok:true};
  });
  await registerJobAdmin(app,db,config,discord);
  await registerIndexRoutes(app,db,config);
  await registerAuditorRoutes(app,db,config);

  app.post("/api/v1/github/sources/:id/sync",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const id=query(z.object({id:idSchema}),req.params).id;
    const options=query(z.object({commits:z.boolean().default(true),releases:z.boolean().default(true)}),req.body);
    const source=await db.query<{repository:string;enabled:boolean;push_enabled:boolean;release_enabled:boolean}>(
      "SELECT repository,enabled,push_enabled,release_enabled FROM github_sources WHERE id=$1",[id]);
    const data=source.rows[0];
    if(!data?.enabled)throw Object.assign(new Error("Source is not enabled"),{statusCode:409});
    const jobs=[];
    if(options.commits && data.push_enabled)jobs.push("github_sync");
    if(options.releases && data.release_enabled)jobs.push("github_releases_sync");
    if(!jobs.length)throw Object.assign(new Error("Selected flows are disabled"),{statusCode:409});
    for(const kind of jobs)await db.query("INSERT INTO automation_jobs(kind,payload,origin) VALUES($1,$2,'admin')",
      [kind,JSON.stringify({repo:data.repository})]);
    await audit(db,"github.sync.request",actor.userId,"github_source",String(id),{jobs});
    return {queued:jobs};
  });
  app.get("/api/v1/audit",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const q=query(page,req.query);
    return {items:(await db.query("SELECT id,actor_id,action,target_kind,target_id,meta,occurred_at FROM audit_events ORDER BY id DESC LIMIT $1 OFFSET $2",[q.limit,q.offset])).rows,...q};
  });
  app.get("/api/v1/stats",async(req)=>{
    const actor=await requireUser(req,db,config);
    const allowed=await visibleDepartments(config,actor);
    const reports=await db.query("SELECT department,count(*)::int AS total FROM reports WHERE department=ANY($1::text[]) GROUP BY department",[allowed]);
    return {reports:reports.rows,source:"database",completeFor:"persisted_reports_only"};
  });
  // Encapsulated raw request body avoids relying on reserialized JSON for HMAC verification.
  await app.register(async sub=>{
    sub.removeContentTypeParser("application/json");
    sub.addContentTypeParser("application/json",{parseAs:"buffer"},(_req,body,done)=>done(null,body));
    sub.post("/api/v1/integrations/github/webhook",async(req,reply)=>{
      if(!config.GITHUB_WEBHOOK_SECRET) return reply.code(503).send({error:"Webhook not configured"});
      const raw=req.body;
      if(!Buffer.isBuffer(raw)|| !verifyGitHubSignature(raw,req.headers["x-hub-signature-256"] as string | undefined,config.GITHUB_WEBHOOK_SECRET)) return reply.code(401).send({error:"Invalid signature"});
      let payload:unknown;
      try {payload=JSON.parse(raw.toString("utf8"));}catch{ return reply.code(400).send({error:"Invalid JSON"}); }
      const event=String(req.headers["x-github-event"]??"");
      const delivery=String(req.headers["x-github-delivery"]??"");
      return {result:await handleGithubEvent(db,event,delivery,payload)};
    });
  });
  return app;
}
