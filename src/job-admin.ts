import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import { confirmGithubPublication,releaseCancelledBatch } from "./github-batches.js";
import type { Config } from "./config.js";
import type { Client } from "discord.js";
import { requireUser } from "./auth.js";

const params=z.object({id:z.coerce.number().int().positive()});
const page=z.object({limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).default(0)});
const status=z.enum(["queued","running","done","failed","needs_reconciliation","cancelled"]);
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("link"),channelId:z.string().regex(/^\d{17,20}$/),messageId:z.string().regex(/^\d{17,20}$/),reason:z.string().min(10).max(500)}),
  z.object({action:z.literal("retry"),confirmRemoteAbsent:z.literal(true),reason:z.string().min(10).max(500)}),
  z.object({action:z.literal("cancel"),reason:z.string().min(10).max(500)})
]);
type JobRow={id:string;kind:string;status:string;payload:{reportId?:string;id?:string};destination:string|null;attempts:number};
const conflict=()=>Object.assign(new Error("Job changed or the transition is forbidden"),{statusCode:409});
export async function registerJobAdmin(app:FastifyInstance,db:DB,config:Config,discord:Client):Promise<void>{
  app.get("/api/v1/jobs",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const q=page.extend({status:status.optional()}).parse(req.query);
    const rows=await db.query(
      "SELECT id,kind,status,origin,destination,correlation,run_at,attempts,last_error,remote_message_id,remote_channel_id,completed_at,created_at FROM automation_jobs WHERE ($1::text IS NULL OR status=$1) ORDER BY id DESC LIMIT $2 OFFSET $3",
      [q.status??null,q.limit,q.offset]);
    return {items:rows.rows,limit:q.limit,offset:q.offset};
  });
  app.get("/api/v1/jobs/:id",async(req)=>{
    await requireUser(req,db,config,{admin:true});
    const {id}=params.parse(req.params);
    const result=await db.query("SELECT * FROM automation_jobs WHERE id=$1",[id]);
    if(!result.rowCount)throw Object.assign(new Error("Job not found"),{statusCode:404});
    const attempts=await db.query("SELECT attempt,started_at,ended_at,outcome,safe_error FROM job_attempts WHERE job_id=$1 ORDER BY attempt DESC",[id]);
    return {job:result.rows[0],attempts:attempts.rows};
  });
  app.post("/api/v1/jobs/:id/reconcile",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const {id}=params.parse(req.params);
    const decision=input.parse(req.body);
    const existing=await db.query<JobRow>("SELECT id,kind,status,payload,destination,attempts FROM automation_jobs WHERE id=$1",[id]);
    const job=existing.rows[0];
    if(!job)throw Object.assign(new Error("Job not found"),{statusCode:404});
    if(!["needs_reconciliation","failed"].includes(job.status))throw conflict();

    let threadId:string|null=null;
    if(decision.action==="link"){
      if(!["report_publish","announcement"].includes(job.kind))throw Object.assign(new Error("Not a publishing job"),{statusCode:400});
      const destination=job.destination??(job.kind==="announcement"?"1559241850316136549":null);
      const reference="Ref: STUDIO-"+(job.kind==="report_publish"?"REPORT-"+job.payload.reportId:"ANNOUNCEMENT-"+job.payload.id);
      const target=await discord.channels.fetch(decision.channelId);
      if(!target || !target.isTextBased() || !("messages" in target))throw Object.assign(new Error("Unsupported channel"),{statusCode:400});
      const message=await target.messages.fetch(decision.messageId);
      if(!discord.user || message.guildId!==config.DISCORD_GUILD_ID || message.author.id!==discord.user.id || !message.content.includes(reference))
        throw Object.assign(new Error("Remote identity could not be verified"),{statusCode:409});
      if((target.isThread()?target.parentId:target.id)!==destination)throw Object.assign(new Error("Destination mismatch"),{statusCode:409});
      threadId=target.isThread()?target.id:null;
    }
    await transaction(db,async c=>{
      if(decision.action==="link"){
        const updated=await c.query("UPDATE automation_jobs SET status='done',remote_message_id=$2,remote_channel_id=$3,completed_at=now(),last_error=NULL WHERE id=$1 AND status IN ('needs_reconciliation','failed') RETURNING id",
          [id,decision.messageId,decision.channelId]);
        if(!updated.rowCount)throw conflict();
        const domain=job.kind==="report_publish"
          ? await c.query("UPDATE reports SET publication_status='published',sync_state='complete',discord_message_id=$2,discord_thread_id=$3,updated_at=now() WHERE id=$1 RETURNING id",
              [job.payload.reportId,decision.messageId,threadId])
          : await c.query("UPDATE announcements SET status='published',discord_message_id=$2,published_at=COALESCE(published_at,now()) WHERE id=$1 RETURNING id",
              [job.payload.id,decision.messageId]);
        if(!domain.rowCount)throw conflict();
        if(job.kind==="report_publish")await confirmGithubPublication(c,String(job.payload.reportId));
      }else if(decision.action==="retry"){
        if(job.attempts>=10)throw Object.assign(new Error("Retry limit reached"),{statusCode:409});
        const updated=await c.query("UPDATE automation_jobs SET status='queued',run_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND status IN ('needs_reconciliation','failed') RETURNING id",[id]);
        if(!updated.rowCount)throw conflict();
        if(job.kind==="report_publish")await c.query("UPDATE reports SET publication_status='queued',sync_state='unknown' WHERE id=$1",[job.payload.reportId]);
        if(job.kind==="announcement")await c.query("UPDATE announcements SET status='scheduled' WHERE id=$1 AND status IN ('publishing','failed')",[job.payload.id]);
      }else{
        const updated=await c.query("UPDATE automation_jobs SET status='cancelled',last_error='Cancelled by ADMIN after reconciliation' WHERE id=$1 AND status IN ('needs_reconciliation','failed') RETURNING id",[id]);
        if(!updated.rowCount)throw conflict();
        if(job.kind==="report_publish"){
          await c.query("UPDATE reports SET publication_status='cancelled' WHERE id=$1",[job.payload.reportId]);
          await releaseCancelledBatch(c,String(job.payload.reportId));
        }
      }
      await c.query("INSERT INTO audit_events(actor_id,action,target_kind,target_id,meta) VALUES($1,$2,'automation_job',$3,$4)",
        [actor.userId,"job.reconcile."+decision.action,String(id),JSON.stringify({reason:decision.reason})]);
    });
    return {ok:true,decision:decision.action};
  });
  app.post("/api/v1/jobs/:id/cancel",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const {id}=params.parse(req.params);
    const {reason}=z.object({reason:z.string().min(5).max(500)}).parse(req.body);
    await transaction(db,async c=>{
      const result=await c.query<{kind:string;payload:{reportId?:string;id?:string}}>(
        "UPDATE automation_jobs SET status='cancelled',last_error='Cancelled by ADMIN' WHERE id=$1 AND status='queued' RETURNING kind,payload",[id]);
      if(!result.rowCount)throw conflict();
      const job=result.rows[0]!;
      if(job.kind==="announcement")await c.query("UPDATE announcements SET status='draft' WHERE id=$1 AND status='scheduled'",[job.payload.id]);
      if(job.kind==="report_publish"){
        await c.query("UPDATE reports SET publication_status='cancelled' WHERE id=$1",[job.payload.reportId]);
        await releaseCancelledBatch(c,String(job.payload.reportId));
      }
      await c.query("INSERT INTO audit_events(actor_id,action,target_kind,target_id,meta) VALUES($1,'job.cancel','automation_job',$2,$3)",
        [actor.userId,String(id),JSON.stringify({reason})]);
    });
    return {ok:true};
  });
}
