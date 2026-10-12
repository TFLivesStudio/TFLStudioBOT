import type { Client } from "discord.js";
import type { DB } from "./db.js";
import { createReport } from "./reports.js";
import { audit } from "./audit.js";
import { fetchGithubRepository,pollGithubCommits } from "./github.js";
import type { Config } from "./config.js";
import type { DepartmentKey } from "./ids.js";
import { postAnnouncement } from "./presentation.js";

type Job = {id:string;kind:string;payload:any;attempts:number};
export async function runOneJob(db: DB, discord: Client): Promise<boolean> {
  const claim = await db.query<Job>(
    "UPDATE automation_jobs SET status='running',attempts=attempts+1,locked_at=now() WHERE id=(SELECT id FROM automation_jobs WHERE status='queued' AND run_at<=now() ORDER BY run_at,id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,kind,payload,attempts"
  );
  const job=claim.rows[0];
  if(!job) return false;
  try {
    if (job.kind.startsWith("github_")) {
      const repository=String(job.payload.repo??"");
      const source=await db.query<{enabled:boolean}>("SELECT enabled FROM github_sources WHERE repository=$1",[repository]);
      if (!source.rows[0]?.enabled) {
        await db.query("UPDATE automation_jobs SET status='failed',last_error='Source disabled' WHERE id=$1",[job.id]);
        return true;
      }
    }
    if(job.kind === "github_release") {
      const p=job.payload as {repo:string;releaseId:number;tag:string;name?:string;body:string;url:string;date?:string};
      const details = "Versión: "+p.tag+"\nPublicada: "+(p.date ?? "Fecha no indicada")+"\n"+p.url+"\n\nChangelog oficial:\n"+(p.body || "Sin notas publicadas");
      await createReport(db,discord,"client","RELEASE / "+p.tag,details.slice(0,1500),null,"github_release:"+p.repo+":"+p.releaseId);
    } else if(job.kind === "github_push_summary") {
      const p=job.payload as {repo:string};
      const rows=await db.query<{sha:string;author:string;title:string;url:string}>(
        "SELECT sha,author,title,url FROM github_commits WHERE repository=$1 AND reported_at IS NULL ORDER BY committed_at,sha LIMIT 25",[p.repo]);
      if (rows.rows.length) {
        const lines=rows.rows.map(r => "- "+r.title.slice(0,120)+" — "+r.author.slice(0,60)+"\n  "+r.url);
        const stamp=rows.rows.map(r=>r.sha).join(",");
        await createReport(db,discord,"client","DESARROLLO / "+rows.rows.length+" commits",lines.join("\n").slice(0,1500),null,"github_push:"+p.repo+":"+stamp);
        await db.query("UPDATE github_commits SET reported_at=now() WHERE repository=$1 AND sha=ANY($2::text[])",[p.repo,rows.rows.map(r=>r.sha)]);
        const more=await db.query("SELECT 1 FROM github_commits WHERE repository=$1 AND reported_at IS NULL LIMIT 1",[p.repo]);
        if (more.rowCount) await db.query("INSERT INTO automation_jobs(kind,payload,run_at,dedup_key) VALUES('github_push_summary',$1,now()+interval '1 minute',$2) ON CONFLICT(dedup_key) DO NOTHING",[JSON.stringify({repo:p.repo}),"push:backlog:"+p.repo+":"+job.id]);
      }
      // After this job has completed, a new push can schedule a fresh batch.
    } else if(job.kind === "announcement") {
      const id=Number(job.payload.id);
      const found=await db.query<{target_channel_id:string;title:string;body:string;status:string;visual_payload:unknown}>("SELECT * FROM announcements WHERE id=$1",[id]);
      const item=found.rows[0];
      if (!item || item.status !== "scheduled") throw new Error("Scheduled announcement unavailable");
      await db.query("UPDATE announcements SET status='publishing' WHERE id=$1",[id]);
      const messageId=await postAnnouncement(discord,item.target_channel_id,item.title,item.body,item.visual_payload);
      await db.query("UPDATE announcements SET status='published',published_at=now(),discord_message_id=$2 WHERE id=$1",[id,messageId]);
    } else {
      throw new Error("Unknown job kind: "+job.kind);
    }
    await db.query("UPDATE automation_jobs SET status='done',last_error=NULL,dedup_key=CASE WHEN kind='github_push_summary' THEN NULL ELSE dedup_key END WHERE id=$1",[job.id]);
  } catch(e) {
    const reason=e instanceof Error?e.message:String(e);
    // Publishing may succeed remotely then fail locally; leave the job for manual reconciliation.
    const retryable = job.kind === "github_push_summary" && job.attempts<3;
    await db.query("UPDATE automation_jobs SET status=$2,run_at=now()+interval '2 minutes',last_error=$3 WHERE id=$1",
      [job.id,retryable?"queued":"needs_reconciliation",reason.slice(0,500)]);
  }
  return true;
}
export function launchWorker(db: DB, discord: Client, config: Config): () => void {
  let closing=false;
  let processing=false;
  const loop=async()=>{
    if(closing||processing||!discord.isReady()) return;
    processing=true;
    try { for(let i=0;i<10&&!closing;i++) if(!await runOneJob(db,discord)) break; }
    catch(e){ console.error("worker_error",e); }
    finally { processing=false; }
  };
  const interval=setInterval(()=>{void loop();},10000);
  void loop();
  const sweep=setInterval(async()=>{
    if (closing) return;
    try {
      await db.query("DELETE FROM sessions WHERE expires_at<now()");
      // Locked, interrupted or ambiguous outbound actions require reconciliation; never blindly replay.
      await db.query("UPDATE automation_jobs SET status='needs_reconciliation',last_error='Interrupted while running' WHERE status='running' AND locked_at<now()-interval '10 minutes'");
      if(config.GITHUB_POLL_ENABLED) {
        const sources=await db.query<{repository:string;release_enabled:boolean;push_enabled:boolean}>("SELECT repository,release_enabled,push_enabled FROM github_sources WHERE enabled AND (release_enabled OR push_enabled)");
        for(const s of sources.rows) {if(s.release_enabled)await fetchGithubRepository(db,config,s.repository);if(s.push_enabled)await pollGithubCommits(db,config,s.repository);}
      }
    } catch(e){console.error("worker_sweep_failed",e);}
  },300000);
  return ()=>{closing=true;clearInterval(interval);clearInterval(sweep);};
}
