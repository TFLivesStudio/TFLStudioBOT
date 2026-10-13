import type { Client } from "discord.js";
import type { DB } from "./db.js";
import { createReport } from "./reports.js";
import { fetchGithubRepository, pollGithubCommits } from "./github.js";
import type { Config } from "./config.js";
import { DEPARTMENTS, IDS, type DepartmentKey } from "./ids.js";
import { postAnnouncement } from "./presentation.js";
import { postToDestination } from "./discord.js";
import { runImportBatch,recoverOrphanedImports } from "./report-import.js";
import { captureStructure } from "./auditor.js";
import { allocateGithubBatch,confirmGithubPublication } from "./github-batches.js";
import { transaction } from "./db.js";
import { executeConfiguredAutomation,scheduleDueAutomations } from "./automations.js";
import { recordReleaseProvenance } from "./github-releases.js";

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
    if(job.kind==="automation_rule"){
      await executeConfiguredAutomation(db,config,job.id,job.payload);
    }else if(job.kind==="auditor_snapshot"){
      if(!config)throw new Error("Auditor requires configuration");
      const id=String(job.payload.snapshotId);
      const selected=await db.query<{options:{includeArchived?:boolean;maxArchivedPerForum?:number};status:string}>(
        "SELECT options,status FROM audit_snapshots WHERE id=$1",[id]);
      const row=selected.rows[0];
      if(!row)throw new Error("Snapshot no longer exists");
      if(row.status!=="done"){
        await db.query("UPDATE audit_snapshots SET status='running' WHERE id=$1",[id]);
        const output=await captureStructure(discord,config,{
          includeArchived:row.options.includeArchived??false,
          maxArchivedPerForum:row.options.maxArchivedPerForum??100
        });
        await db.query("UPDATE audit_snapshots SET status='done',snapshot=$2,markdown=$3,completeness=$4,finished_at=now(),error=NULL WHERE id=$1",
          [id,JSON.stringify(output.data),output.markdown,output.data.completeness]);
      }
    }else if(job.kind==="history_import"){
      if(!config)throw new Error("Import worker requires configuration");
      const id=String(job.payload.runId);

      await runImportBatch(db,config,id);
    }else if(job.kind==="report_publish"){
      const id=String(job.payload.reportId??"");
      const rows=await db.query<{department:DepartmentKey;discord_channel_id:string;title:string;description:string;tags:string[];discord_message_id:string|null;publication_status:string;source:string;project:string|null}>(
        "SELECT department,source,project,discord_channel_id,title,description,tags,discord_message_id,publication_status FROM reports WHERE id=$1",[id]);
      const report=rows.rows[0];
      if(!report)throw new Error("Report no longer exists");
      if(report.discord_message_id){
        await transaction(db,async c=>{
          await confirmGithubPublication(c,id);
          await c.query("UPDATE automation_jobs SET status='done',completed_at=now() WHERE id=$1",[job.id]);
          await c.query("UPDATE job_attempts SET ended_at=now(),outcome='done' WHERE job_id=$1 AND attempt=$2",[job.id,job.attempts]);
        });
        return true;
      }
      if(report.source==="github" && report.project){
        const control=await db.query<{enabled:boolean;push_enabled:boolean;release_enabled:boolean}>(
          "SELECT enabled,push_enabled,release_enabled FROM github_sources WHERE repository=$1",[report.project]);
        const enabled=control.rows[0];
        const release=String(report.title).startsWith("RELEASE /");
        if(!enabled?.enabled || (release?!enabled.release_enabled:!enabled.push_enabled))
          throw new Error("GitHub integration disabled before queued publication");
      }
      const destinationId=DEPARTMENTS[report.department]?.destination;
      if(!destinationId || destinationId!==report.discord_channel_id)throw new Error("Unapproved destination");
      await db.query("UPDATE reports SET publication_status='publishing',updated_at=now() WHERE id=$1",[id]);
      remoteStarted=true;
      const posted=await postToDestination(discord,destinationId,report.title,report.description,report.tags,"STUDIO-REPORT-"+id);
      await transaction(db,async c=>{
        await c.query("UPDATE reports SET discord_message_id=$2,discord_thread_id=$3,publication_status='published',sync_state='complete',updated_at=now() WHERE id=$1",
          [id,posted.messageId,posted.threadId]);
        await confirmGithubPublication(c,id);
        await c.query("UPDATE automation_jobs SET status='done',completed_at=now(),last_error=NULL,remote_message_id=$2,remote_channel_id=$3,updated_at=now() WHERE id=$1",
          [job.id,posted.messageId,posted.threadId??destinationId]);
        await c.query("UPDATE job_attempts SET ended_at=now(),outcome='done',safe_error=NULL WHERE job_id=$1 AND attempt=$2",
          [job.id,job.attempts]);
      });
      return true;
    }else if(job.kind==="guide_publish"){
      const guideId=String(job.payload.id);
      const version=Number(job.payload.version);
      const rows=await db.query<{title:string;body:string;version:number;lifecycle:string;discord_sync_state:string;discord_thread_id:string|null}>(
        "SELECT title,body,version,lifecycle,discord_sync_state,discord_thread_id FROM guides WHERE id=$1",[guideId]);
      const guide=rows.rows[0];
      if(!guide || guide.lifecycle!=="active" || guide.version!==version || guide.discord_sync_state!=="queued" || guide.discord_thread_id)
        throw new Error("Guide changed, archived or already linked");
      if(guide.body.length>1450)throw new Error("Guide exceeds one Discord post");
      remoteStarted=true;
      const posted=await postToDestination(discord,IDS.channels.guias,"GUÍA / "+guide.title.slice(0,85),
        guide.body,Array.isArray(job.payload.tagIds)?job.payload.tagIds.filter((t):t is string=>typeof t==="string"):[],
        "STUDIO-GUIDE-"+guideId+"-v"+version);
      if(!posted.threadId)throw new Error("Guide must be a forum thread");
      await transaction(db,async c=>{
        const update=await c.query(
          "UPDATE guides SET discord_thread_id=$2,discord_sync_state='published',discord_synced_version=$3,updated_at=now() "+
          "WHERE id=$1 AND version=$3 AND discord_sync_state='queued' RETURNING id",
          [guideId,posted.threadId,version]);
        if(!update.rowCount)throw new Error("Guide changed during remote publication");
        await c.query("UPDATE automation_jobs SET status='done',completed_at=now(),last_error=NULL,remote_message_id=$2,"+
          "remote_channel_id=$3,updated_at=now() WHERE id=$1",[job.id,posted.messageId,posted.threadId]);
        await c.query("UPDATE job_attempts SET ended_at=now(),outcome='done' WHERE job_id=$1 AND attempt=$2",
          [job.id,job.attempts]);
      });
      return true;
    }else if(job.kind==="github_sync"){
      if(!config)throw new Error("GitHub sync requires configuration");
      await pollGithubCommits(db,config,String(job.payload.repo));
    }else if(job.kind==="github_releases_sync"){
      if(!config)throw new Error("GitHub release sync requires configuration");
      await fetchGithubRepository(db,config,String(job.payload.repo));
    }else if(job.kind==="github_release"){
      if(!config)throw new Error("Release provenance requires configuration");
      const p=job.payload;
      const release={
        repo:String(p.repo),releaseId:Number(p.releaseId),tag:String(p.tag),name:typeof p.name==="string"?p.name:undefined,
        body:String(p.body??""),url:String(p.url??""),date:typeof p.date==="string"?p.date:undefined,
        prerelease:!!p.prerelease,edited:!!p.edited
      };
      const key="github_release:"+release.repo+":"+release.releaseId;
      let reportId:string|null=null;
      const old=await db.query<{id:string}>("SELECT id FROM reports WHERE external_key=$1",[key]);
      if(old.rows[0])reportId=old.rows[0].id;
      if(!p.edited && !reportId){
        const version=release.tag.slice(0,90);
        const prefix="Versión: "+version+"\nTipo: "+(release.prerelease?"Prerelease":"Release")+
          (release.name?"\nNombre: "+release.name.slice(0,150):"")+
          "\nPublicada: "+(release.date??"Fecha no indicada")+"\nEnlace oficial: "+release.url+
          "\n\nChangelog oficial:\n";
        const limit=Math.max(0,1450-prefix.length-110);
        const truncated=release.body.length>limit;
        const notes=release.body.slice(0,limit);
        const summary=prefix+notes+(truncated?"\n\nNotas abreviadas; consultar el enlace oficial para el contenido completo.":"");
        const created=await createReport(db,discord,destination,"RELEASE / "+version,summary,null,key,[],release.repo);
        reportId=created.id;
      }
      await recordReleaseProvenance(db,config,release,reportId);
    }else if(job.kind==="github_push_summary"){
      await allocateGithubBatch(db,String(job.payload.repo),destination);
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
      await transaction(db,async c=>{
        await c.query("UPDATE announcements SET status='published',published_at=now(),discord_message_id=$2,updated_at=now() WHERE id=$1",
          [id,msg]);
        await c.query("UPDATE automation_jobs SET status='done',completed_at=now(),last_error=NULL,"+
          "remote_message_id=$2,remote_channel_id=$3,updated_at=now() WHERE id=$1",[job.id,msg,item.target_channel_id]);
        await c.query("UPDATE job_attempts SET ended_at=now(),outcome='done' WHERE job_id=$1 AND attempt=$2",
          [job.id,job.attempts]);
      });
      return true;
    }else throw new Error("Unknown job type");
    await db.query("UPDATE automation_jobs SET status='done',completed_at=now(),last_error=NULL,updated_at=now() WHERE id=$1",[job.id]);
    await completeAttempt(db,job,"done");
  }catch(e){
    const err=safeMessage(e);
    if(job.kind==="report_publish" && remoteStarted){
      const settled=await db.query<{status:string}>(
        "SELECT status FROM automation_jobs WHERE id=$1",[job.id]).catch(()=>null);
      if(settled?.rows[0]?.status==="done")return true;
    }
    // Once a remote call starts, even an HTTP error may mean an accepted Discord write.
    const status=remoteStarted?"needs_reconciliation":job.attempts<3?"queued":"failed";
    const delay=Math.min(300,10*(2**Math.min(5,job.attempts)));
    await db.query("UPDATE automation_jobs SET status=$2,last_error=$3,updated_at=now(),run_at=now()+($4::int*interval '1 second') WHERE id=$1 AND status='running'",
      [job.id,status,err,delay]);
    if(job.kind==="automation_rule")await db.query(
      "UPDATE automation_definitions SET last_error=$2 WHERE id=$1",
      [job.payload.ruleId,err]);
    if(job.kind==="auditor_snapshot")await db.query(
      "UPDATE audit_snapshots SET status=$2,error=$3 WHERE id=$1",[job.payload.snapshotId,status==="queued"?"queued":"failed",err]);
    if(job.kind==="guide_publish" && remoteStarted)await db.query(
      "UPDATE guides SET discord_sync_state='conflict' WHERE id=$1 AND discord_sync_state='queued'",
      [job.payload.id]);
    if(job.kind==="announcement" && remoteStarted)await db.query(
      "UPDATE announcements SET status='failed',last_error='Remote publication may have succeeded' WHERE id=$1 AND status='publishing'",
      [job.payload.id]);
    if(job.kind==="report_publish" && remoteStarted)await db.query(
      "UPDATE reports SET publication_status='needs_reconciliation',sync_state='unknown',updated_at=now() WHERE id=$1 AND publication_status='publishing'",[job.payload.reportId]);
    await completeAttempt(db,job,status,err);
  }
  return true;
}
export function launchWorker(db:DB,discord:Client,config:Config):()=>void{
  let closing=false,processing=false;
  const heartbeat=async(component:string,state:string,detail:string|null=null)=>{
    await db.query("INSERT INTO worker_heartbeats(component,last_seen_at,state,detail,last_job_at) "+
      "VALUES($1,now(),$2,$3,now()) ON CONFLICT(component) DO UPDATE SET "+
      "last_seen_at=now(),state=EXCLUDED.state,detail=EXCLUDED.detail,last_job_at=now(),updated_at=now()",
      [component,state,detail]).catch(()=>undefined);
  };
  const loop=async()=>{
    if(closing||processing||!discord.isReady())return;
    processing=true;
    try{
      await heartbeat("jobs","working");
      for(let i=0;i<10&&!closing;i++)if(!await runOneJob(db,discord,config))break;
      await heartbeat("jobs","idle");
    }
    catch(e){console.error("worker_failed",safeMessage(e));await heartbeat("jobs","degraded",safeMessage(e));}
    finally{processing=false;}
  };
  void recoverOrphanedImports(db).catch(e=>console.error("import_recovery_failed",safeMessage(e)));
  void scheduleDueAutomations(db).catch(e=>console.error("automation_schedule_failed",safeMessage(e)));
  const interval=setInterval(()=>void loop(),10000);
  void loop();
  const sweep=setInterval(async()=>{
    if(closing)return;
    try{
      await db.query("DELETE FROM sessions WHERE expires_at<now()");
      // No replay after a possible remote publication. ADMIN must reconcile.
      await db.query("UPDATE automation_jobs SET status='needs_reconciliation',last_error='Worker interrupted: remote result unknown',updated_at=now() WHERE status='running' AND kind<>'history_import' AND locked_at<now()-interval '10 minutes'");
      await db.query("UPDATE reports SET publication_status='needs_reconciliation',sync_state='unknown' WHERE publication_status='publishing' AND updated_at<now()-interval '10 minutes'");
      await db.query("UPDATE automation_jobs SET status='failed',last_error='Expired import worker lease' "+
        "WHERE kind='history_import' AND status='running' AND locked_at<now()-interval '30 minutes'");
      await recoverOrphanedImports(db);
      await scheduleDueAutomations(db);
      await heartbeat("sweep","idle");
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
