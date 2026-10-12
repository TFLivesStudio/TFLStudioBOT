import type { Client } from "discord.js";
import type { DB } from "./db.js";
import { createReport } from "./reports.js";
import { fetchGithubRepository, pollGithubCommits } from "./github.js";
import type { Config } from "./config.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { postAnnouncement } from "./presentation.js";
import { postToDestination } from "./discord.js";
import { runImportBatch } from "./report-import.js";
import { captureStructure } from "./auditor.js";

type Job = {id:string;kind:string;payload:Record<string,unknown>;attempts:number};
const safeMessage=(e:unknown) => e instanceof Error ? e.name.slice(0,40)+": "+e.message.slice(0,250) : "Unknown error";
async function completeAttempt(db:DB,job:Job,outcome:string,error?:string):Promise<void>{
  await db.query("UPDATE job_attempts SET ended_at=now(),outcome=$3,safe_error=$4 WHERE job_id=$1 AND attempt=$2",[job.id,job.attempts,outcome,error??null]);
}
/** A claim is atomic; external I/O is never performed while holding a database transaction. */
export async function runOneJob(db:DB,discord:Client,config?:Config):Promise<boolean>{
  const result=await db.query<Job>(
    "UPDATE automation_jobs SET status='running',attempts=attempts+1,locked_at=now(),updated_at=now() WHERE id=(SELECT id FROM automation_jobs WHERE status='queued' AND run_at<=now() ORDER BY run_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,kind,payload,attempts"
  );
  const job=result.rows[0];
  if(!job)return false;
  let remoteStarted=false;
  try{
    await db.query("INSERT INTO job_attempts(job_id,attempt) VALUES($1,$2)",[job.id,job.attempts]);
    if(job.kind==="github_push_summary"){
      await db.query("UPDATE automation_jobs SET dedup_key=NULL WHERE id=$1",[job.id]);
    }
    let destination:DepartmentKey="client";
    if(job.kind.startsWith("github_")){
      const repository=String(job.payload.repo??"");
      const source=await db.query<{enabled:boolean;department:string;push_enabled:boolean;release_enabled:boolean}>(
        "SELECT enabled,department,push_enabled,release_enabled FROM github_sources WHERE repository=$1",[repository]);
      const sourceRow=source.rows[0];
      if(!sourceRow?.enabled || (["github_release","github_releases_sync"].includes(job.kind) && !sourceRow.release_enabled) || (["github_push_summary","github_sync"].includes(job.kind) && !sourceRow.push_enabled)){
        await db.query("UPDATE automation_jobs SET status='cancelled',last_error='Source disabled' WHERE id=$1",[job.id]);
        await completeAttempt(db,job,"cancelled");
        return true;
      }
      if(!(sourceRow.department in DEPARTMENTS))throw new Error("Destination not configured");
      destination=sourceRow.department as DepartmentKey;
    }
    if(job.kind==="auditor_snapshot"){
      if(!config)throw new Error("Auditor requires configuration");
      const id=String(job.payload.snapshotId);
      const selected=await db.query<{options:{includeArchived?:boolean;maxArchivedPerForum?:number};status:string}>(
        "SELECT options,status FROM audit_snapshots WHERE id=$1",[id]);
      const row=selected.rows[0];
      if(!row || row.status==="done")return true;
      await db.query("UPDATE audit_snapshots SET status='running' WHERE id=$1",[id]);
      const output=await captureStructure(discord,config,{
        includeArchived:row.options.includeArchived??false,
        maxArchivedPerForum:row.options.maxArchivedPerForum??100
      });
      await db.query("UPDATE audit_snapshots SET status='done',snapshot=$2,markdown=$3,completeness=$4,finished_at=now(),error=NULL WHERE id=$1",
        [id,JSON.stringify(output.data),output.markdown,output.data.completeness]);
    }else if(job.kind==="history_import"){
      if(!config)throw new Error("Import worker requires configuration");
      const id=String(job.payload.runId);
      await db.query("UPDATE report_import_runs SET status='running' WHERE id=$1 AND status='queued'",[id]);
      const next=await runImportBatch(db,config,id);
      if(next==="more")await db.query("INSERT INTO automation_jobs(kind,payload,origin) VALUES('history_import',$1,'admin')",[JSON.stringify({runId:id})]);
    }else if(job.kind==="report_publish"){
      const id=String(job.payload.reportId??"");
      const rows=await db.query<{department:DepartmentKey;discord_channel_id:string;title:string;description:string;tags:string[];discord_message_id:string|null;publication_status:string}>(
        "SELECT department,discord_channel_id,title,description,tags,discord_message_id,publication_status FROM reports WHERE id=$1",[id]);
      const report=rows.rows[0];
      if(!report)throw new Error("Report no longer exists");
      if(report.discord_message_id){
        await db.query("UPDATE automation_jobs SET status='done',completed_at=now() WHERE id=$1",[job.id]);
        await completeAttempt(db,job,"done");
        return true;
      }
      const destinationId=DEPARTMENTS[report.department]?.destination;
      if(!destinationId || destinationId!==report.discord_channel_id)throw new Error("Unapproved destination");
      await db.query("UPDATE reports SET publication_status='publishing',updated_at=now() WHERE id=$1",[id]);
      remoteStarted=true;
      const posted=await postToDestination(discord,destinationId,report.title,report.description,report.tags,"STUDIO-REPORT-"+id);
      await db.query("UPDATE reports SET discord_message_id=$2,discord_thread_id=$3,publication_status='published',sync_state='complete',updated_at=now() WHERE id=$1",
        [id,posted.messageId,posted.threadId]);
      await db.query("UPDATE automation_jobs SET remote_message_id=$2,remote_channel_id=$3 WHERE id=$1",
        [job.id,posted.messageId,posted.threadId??destinationId]);
    }else if(job.kind==="github_sync"){
      if(!config)throw new Error("GitHub sync requires configuration");
      await pollGithubCommits(db,config,String(job.payload.repo));
    }else if(job.kind==="github_releases_sync"){
      if(!config)throw new Error("GitHub release sync requires configuration");
      await fetchGithubRepository(db,config,String(job.payload.repo));
    }else if(job.kind==="github_release"){
      const p=job.payload;
      const version=String(p.tag??"unknown").slice(0,90);
      const text="Versión: "+version+"\nTipo: "+(p.prerelease?"Prerelease":"Release")+(p.name?"\nNombre: "+String(p.name).slice(0,150):"")+"\nPublicada: "+String(p.date??"Fecha desconocida")+
        "\nEnlace oficial: "+String(p.url??"")+"\n\nChangelog oficial:\n"+String(p.body??"Sin notas publicadas");
      await createReport(db,discord,destination,"RELEASE / "+version,text.slice(0,1500),null,
        "github_release:"+String(p.repo)+":"+String(p.releaseId));
    }else if(job.kind==="github_push_summary"){
      const repo=String(job.payload.repo);
      const rows=await db.query<{sha:string;author:string;title:string;url:string}>(
        "SELECT sha,author,title,url FROM github_commits WHERE repository=$1 AND reported_at IS NULL ORDER BY committed_at,sha LIMIT 25",[repo]);
      if(rows.rows.length){
        const lines=rows.rows.map(c=>"- "+c.title.slice(0,115)+" — "+c.author.slice(0,60)+"\n"+c.url);
        const key="github_push:"+repo+":"+rows.rows.map(c=>c.sha).join(",");
        await createReport(db,discord,destination,"DESARROLLO / "+rows.rows.length+" commits",lines.join("\n").slice(0,1500),null,key);
        await db.query("UPDATE github_commits SET reported_at=now() WHERE repository=$1 AND sha=ANY($2::text[])",[repo,rows.rows.map(c=>c.sha)]);
        const more=await db.query("SELECT 1 FROM github_commits WHERE repository=$1 AND reported_at IS NULL LIMIT 1",[repo]);
        if(more.rowCount)await db.query("INSERT INTO automation_jobs(kind,payload,run_at,dedup_key) VALUES('github_push_summary',$1,now()+interval '1 minute',$2) ON CONFLICT DO NOTHING",
          [JSON.stringify({repo}),"push:backlog:"+repo+":"+job.id]);
      }
    }else if(job.kind==="announcement"){
      const id=String(job.payload.id);
      const rows=await db.query<{target_channel_id:string;title:string;body:string;status:string;visual_payload:unknown;discord_message_id:string|null}>(
        "SELECT * FROM announcements WHERE id=$1",[id]);
      const item=rows.rows[0];
      if(!item || (item.status!=="scheduled" && item.status!=="published"))throw new Error("Announcement not available");
      if(item.status==="published" && item.discord_message_id){
        await db.query("UPDATE automation_jobs SET status='done',completed_at=now() WHERE id=$1",[job.id]);
        await completeAttempt(db,job,"done");
        return true;
      }
      await db.query("UPDATE announcements SET status='publishing' WHERE id=$1 AND status='scheduled'",[id]);
      remoteStarted=true;
      const msg=await postAnnouncement(discord,item.target_channel_id,item.title,item.body,item.visual_payload,"STUDIO-ANNOUNCEMENT-"+id);
      await db.query("UPDATE announcements SET status='published',published_at=now(),discord_message_id=$2 WHERE id=$1",[id,msg]);
      await db.query("UPDATE automation_jobs SET remote_message_id=$2,remote_channel_id=$3 WHERE id=$1",[job.id,msg,item.target_channel_id]);
    }else throw new Error("Unknown job type");
    await db.query("UPDATE automation_jobs SET status='done',completed_at=now(),last_error=NULL,updated_at=now() WHERE id=$1",[job.id]);
    await completeAttempt(db,job,"done");
  }catch(e){
    const err=safeMessage(e);
    // Once a remote call starts, even an HTTP error may mean an accepted Discord write.
    const status=remoteStarted?"needs_reconciliation":job.attempts<3?"queued":"failed";
    const delay=Math.min(300,10*(2**Math.min(5,job.attempts)));
    await db.query("UPDATE automation_jobs SET status=$2,last_error=$3,updated_at=now(),run_at=now()+($4::int*interval '1 second') WHERE id=$1",
      [job.id,status,err,delay]);
    if(job.kind==="auditor_snapshot")await db.query(
      "UPDATE audit_snapshots SET status=$2,error=$3 WHERE id=$1",[job.payload.snapshotId,status==="queued"?"queued":"failed",err]);
    if(job.kind==="report_publish" && remoteStarted)await db.query(
      "UPDATE reports SET publication_status='needs_reconciliation',sync_state='unknown',updated_at=now() WHERE id=$1",[job.payload.reportId]);
    await completeAttempt(db,job,status,err);
  }
  return true;
}
export function launchWorker(db:DB,discord:Client,config:Config):()=>void{
  let closing=false,processing=false;
  const loop=async()=>{
    if(closing||processing||!discord.isReady())return;
    processing=true;
    try{for(let i=0;i<10&&!closing;i++)if(!await runOneJob(db,discord,config))break;}
    catch(e){console.error("worker_failed",safeMessage(e));}
    finally{processing=false;}
  };
  const interval=setInterval(()=>void loop(),10000);
  void loop();
  const sweep=setInterval(async()=>{
    if(closing)return;
    try{
      await db.query("DELETE FROM sessions WHERE expires_at<now()");
      // No replay after a possible remote publication. ADMIN must reconcile.
      await db.query("UPDATE automation_jobs SET status='needs_reconciliation',last_error='Worker interrupted: remote result unknown',updated_at=now() WHERE status='running' AND locked_at<now()-interval '10 minutes'");
      await db.query("UPDATE reports SET publication_status='needs_reconciliation',sync_state='unknown' WHERE publication_status='publishing' AND updated_at<now()-interval '10 minutes'");
      if(config.GITHUB_POLL_ENABLED){
        const rows=await db.query<{repository:string;release_enabled:boolean;push_enabled:boolean}>(
          "SELECT repository,release_enabled,push_enabled FROM github_sources WHERE enabled AND (release_enabled OR push_enabled)");
        for(const source of rows.rows){
          if(source.release_enabled)await fetchGithubRepository(db,config,source.repository);
          if(source.push_enabled)await pollGithubCommits(db,config,source.repository);
        }
      }
    }catch(e){console.error("worker_sweep_failed",safeMessage(e));}
  },300000);
  return ()=>{closing=true;clearInterval(interval);clearInterval(sweep);};
}
