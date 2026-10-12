import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import type { Client } from "discord.js";
import { requireUser } from "./auth.js";
import { audit } from "./audit.js";

const params=z.object({id:z.coerce.number().int().positive()});
const page=z.object({limit:z.coerce.number().int().min(1).max(100).default(30),offset:z.coerce.number().int().min(0).default(0)});
const status=z.enum(["queued","running","done","failed","needs_reconciliation","cancelled"]);
const input=z.discriminatedUnion("action",[
  z.object({action:z.literal("link"),channelId:z.string().regex(/^\d{17,20}$/),messageId:z.string().regex(/^\d{17,20}$/),reason:z.string().min(10).max(500)}),
  z.object({action:z.literal("retry"),confirmRemoteAbsent:z.literal(true),reason:z.string().min(10).max(500)}),
  z.object({action:z.literal("cancel"),reason:z.string().min(10).max(500)})
]);
type JobRow={id:string;kind:string;status:string;payload:{reportId?:string;id?:string};destination:string|null;attempts:number};
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
    const history=await db.query("SELECT attempt,started_at,ended_at,outcome,safe_error FROM job_attempts WHERE job_id=$1 ORDER BY attempt DESC",[id]);
    return {job:result.rows[0],attempts:history.rows};
  });
  app.post("/api/v1/jobs/:id/reconcile",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const {id}=params.parse(req.params);
    const decision=input.parse(req.body);
    const result=await db.query<JobRow>("SELECT id,kind,status,payload,destination,attempts FROM automation_jobs WHERE id=$1",[id]);
    const job=result.rows[0];
    if(!job)throw Object.assign(new Error("Job not found"),{statusCode:404});
    if(job.status!=="needs_reconciliation" && job.status!=="failed")
      throw Object.assign(new Error("Job is not pending reconciliation"),{statusCode:409});
    if(decision.action==="link"){
      if(!["report_publish","announcement"].includes(job.kind))
        throw Object.assign(new Error("Only Discord publishing jobs can link messages"),{statusCode:400});
      const destination=job.destination ?? (job.kind==="announcement" ? "1559241850316136549" : null);
      const expected="STUDIO-"+(job.kind==="report_publish"?"REPORT-"+job.payload.reportId:"ANNOUNCEMENT-"+job.payload.id);
      const target=await discord.channels.fetch(decision.channelId);
      if(!target || !("messages" in target) || !target.isTextBased())
        throw Object.assign(new Error("Not a supported Discord channel"),{statusCode:400});
      const message=await target.messages.fetch(decision.messageId);
      if(!discord.user || message.author.id!==discord.user.id || message.guildId!==config.DISCORD_GUILD_ID || !message.content.includes("Ref: "+expected))
        throw Object.assign(new Error("Remote message identity does not match the job"),{statusCode:409});
      const parent=target.isThread()?target.parentId:target.id;
      if(parent!==destination)throw Object.assign(new Error("Remote destination mismatch"),{statusCode:409});
      const updated=await db.query("UPDATE automation_jobs SET status='done',remote_message_id=$2,remote_channel_id=$3,completed_at=now(),last_error=NULL WHERE id=$1 AND status IN ('needs_reconciliation','failed') RETURNING id",
        [id,decision.messageId,decision.channelId]);
      if(!updated.rowCount)throw Object.assign(new Error("Job changed during reconciliation"),{statusCode:409});
      if(job.kind==="report_publish")await db.query(
        "UPDATE reports SET publication_status='published',sync_state='complete',discord_message_id=$2,discord_thread_id=$3,updated_at=now() WHERE id=$1",
        [job.payload.reportId,decision.messageId,target.isThread()?target.id:null]);
      else await db.query(
        "UPDATE announcements SET status='published',discord_message_id=$2,published_at=COALESCE(published_at,now()) WHERE id=$1",
        [job.payload.id,decision.messageId]);
    }else if(decision.action==="retry"){
      // Explicit ADMIN acknowledgment is mandatory: remote absence cannot always be proven.
      if(job.attempts>=10)throw Object.assign(new Error("Retry limit reached"),{statusCode:409});
      const updated=await db.query("UPDATE automation_jobs SET status='queued',run_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND status IN ('needs_reconciliation','failed') RETURNING id",[id]);
      if(!updated.rowCount)throw Object.assign(new Error("Job changed"),{statusCode:409});
      if(job.kind==="report_publish")await db.query("UPDATE reports SET publication_status='queued' WHERE id=$1",[job.payload.reportId]);
      if(job.kind==="announcement")await db.query("UPDATE announcements SET status='scheduled' WHERE id=$1 AND status='publishing'",[job.payload.id]);
    }else{
      const updated=await db.query("UPDATE automation_jobs SET status='cancelled',last_error='Cancelled following ADMIN reconciliation' WHERE id=$1 AND status IN ('needs_reconciliation','failed') RETURNING id",[id]);
      if(!updated.rowCount)throw Object.assign(new Error("Job changed"),{statusCode:409});
    }
    await audit(db,"job.reconcile."+decision.action,actor.userId,"automation_job",String(id),{reason:decision.reason});
    return {ok:true,decision:decision.action};
  });
  app.post("/api/v1/jobs/:id/cancel",async(req)=>{
    const actor=await requireUser(req,db,config,{admin:true,mutation:true});
    const {id}=params.parse(req.params);
    const reason=z.object({reason:z.string().min(5).max(500)}).parse(req.body).reason;
    const result=await db.query<{kind:string;payload:{reportId?:string;id?:string}}>(
      "UPDATE automation_jobs SET status='cancelled',last_error='Cancelled by ADMIN' WHERE id=$1 AND status='queued' RETURNING kind,payload",[id]);
    if(!result.rowCount)throw Object.assign(new Error("Only queued jobs can be cancelled"),{statusCode:409});
    const job=result.rows[0]!;
    if(job.kind==="announcement")await db.query("UPDATE announcements SET status='draft' WHERE id=$1 AND status='scheduled'",[job.payload.id]);
    await audit(db,"job.cancel",actor.userId,"automation_job",String(id),{reason});
    return {ok:true};
  });
}
