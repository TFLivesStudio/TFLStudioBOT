import { createHmac, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.js";
import type { Config } from "./config.js";

const isSha=(value:unknown):value is string=>typeof value==="string" && /^[a-f0-9]{40}$/.test(value) && !/^0{40}$/.test(value);
const apiHeaders=(config:Config):Record<string,string>=>{
  const headers:Record<string,string>={"Accept":"application/vnd.github+json","User-Agent":"TFL-Studio-Core"};
  if(config.GITHUB_TOKEN)headers.Authorization="Bearer "+config.GITHUB_TOKEN;
  return headers;
};
export function verifyGitHubSignature(raw:Buffer,signature:string|undefined,secret:string):boolean{
  if(!signature || !/^sha256=[0-9a-f]{64}$/.test(signature))return false;
  const actual=Buffer.from(signature.slice(7),"hex");
  const expected=createHmac("sha256",secret).update(raw).digest();
  return actual.length===expected.length && timingSafeEqual(actual,expected);
}
type Repo={id?:number;full_name?:string;default_branch?:string};
type Push={
  ref?:string;before?:string;after?:string;deleted?:boolean;repository?:Repo;
  commits?:Array<{id:string;message:string;url:string}>
};
type Release={
  action?:string;repository?:Repo;
  release?:{id:number;tag_name:string;name?:string;body?:string;html_url:string;published_at?:string;draft?:boolean;prerelease?:boolean;target_commitish?:string}
};
type Source={id:string;enabled:boolean;department:string;default_branch:string;repository_id:string|null;
  batch_minutes:number;push_enabled:boolean;release_enabled:boolean;allow_prereleases:boolean};

/** Signed payload must be verified by the HTTP adapter before calling this service. */
export async function handleGithubEvent(db:DB,event:string,delivery:string,payload:unknown):Promise<string>{
  if(!["push","release"].includes(event))return "ignored";
  if(!/^[A-Za-z0-9-]{1,128}$/.test(delivery))throw new Error("Invalid GitHub delivery");
  const p=payload as Push & Release;
  const repository=p.repository?.full_name;
  if(!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))return "ignored";
  const found=await db.query<Source>("SELECT * FROM github_sources WHERE repository=$1",[repository]);
  const source=found.rows[0];
  if(!source?.enabled)return "disabled";
  if(source.repository_id!==null && String(p.repository?.id??"")!==String(source.repository_id))
    throw new Error("GitHub repository identity mismatch");
  const client=await db.connect();
  try{
    await client.query("BEGIN");
    const marker=await client.query(
      "INSERT INTO webhook_deliveries(delivery_id,event_name) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING delivery_id",
      [delivery,event]);
    if(!marker.rowCount){await client.query("COMMIT");return "duplicate";}
    if(event==="push" && source.push_enabled && !p.deleted && p.ref==="refs/heads/"+source.default_branch){
      // GitHub webhook commit arrays are capped. Never treat that array as a complete history.
      // A background compare walks every page starting from a persisted cursor.
      if(isSha(p.before)){
        await client.query("UPDATE github_sources SET last_commit_sha=$2 WHERE id=$1 AND last_commit_sha IS NULL",[source.id,p.before]);
      }else{
        await client.query("UPDATE github_sources SET last_sync_error='Push has no valid base SHA: manual baseline needed' WHERE id=$1 AND last_commit_sha IS NULL",[source.id]);
      }
      await client.query("INSERT INTO automation_jobs(kind,payload,dedup_key,origin) VALUES('github_sync',$1,$2,'github_webhook') ON CONFLICT(dedup_key) DO NOTHING",
        [JSON.stringify({repo:repository}),"github_sync:"+delivery]);
    }
    if(event==="release" && source.release_enabled && p.action==="published" && p.release && !p.release.draft &&
      (source.allow_prereleases || !p.release.prerelease)){
      const release=p.release;
      const url=new URL(release.html_url);
      if(url.protocol!=="https:" || url.hostname!=="github.com" || !url.pathname.startsWith("/"+repository+"/releases/"))
        throw new Error("Invalid GitHub release link");
      await client.query("INSERT INTO automation_jobs(kind,payload,dedup_key,origin) VALUES('github_release',$1,$2,'github_webhook') ON CONFLICT(dedup_key) DO NOTHING",
        [JSON.stringify({repo:repository,releaseId:release.id,tag:release.tag_name,
          name:release.name,body:release.body??"",url:release.html_url,date:release.published_at,
          prerelease:!!release.prerelease,target:release.target_commitish}),
          "release:"+repository+":"+release.id]);
    }
    await client.query("COMMIT");
    return "accepted";
  }catch(e){await client.query("ROLLBACK");throw e;}
  finally{client.release();}
}
async function githubGet<T>(config:Config,repository:string,path:string):Promise<T>{
  const response=await fetch("https://api.github.com/repos/"+repository+path,{
    headers:apiHeaders(config),signal:AbortSignal.timeout(20000)
  });
  if(!response.ok)throw new Error("GitHub API status "+response.status);
  return response.json() as Promise<T>;
}
export type Comparison={
  status:string;total_commits:number;
  commits:Array<{sha:string;html_url:string;commit:{message:string;author:{name:string;date:string}|null}}>
};
/** Compare pagination is exhaustive or fails without modifying the stored cursor. */
export async function collectComparison(config:Config,repo:string,base:string,head:string):Promise<Comparison["commits"]>{
  const commits=new Map<string,Comparison["commits"][number]>();
  let total:number|null=null;
  for(let page=1;page<=30;page++){
    const result=await githubGet<Comparison>(config,repo,"/compare/"+base+"..."+head+"?per_page=100&page="+page);
    if(!["ahead","identical"].includes(result.status))throw new Error("Non-fast-forward branch; ADMIN rebaseline required");
    if(!Number.isSafeInteger(result.total_commits) || result.total_commits>3000)throw new Error("Compare exceeds safe pagination limit");
    if(total===null)total=result.total_commits;
    if(total!==result.total_commits)throw new Error("Repository moved during comparison");
    for(const c of result.commits)if(isSha(c.sha))commits.set(c.sha,c);
    if(commits.size>=total)return [...commits.values()];
    if(result.commits.length===0)break;
  }
  throw new Error("Incomplete GitHub comparison; cursor unchanged");
}
export async function pollGithubCommits(db:DB,config:Config,repository:string):Promise<number>{
  const entry=await db.query<{id:string;last_commit_sha:string|null;default_branch:string;batch_minutes:number}>(
    "SELECT id,last_commit_sha,default_branch,batch_minutes FROM github_sources WHERE repository=$1 AND enabled AND push_enabled",[repository]);
  const source=entry.rows[0];
  if(!source)return 0;
  try{
    const branch=await githubGet<{commit:{sha:string}}>(config,repository,"/branches/"+encodeURIComponent(source.default_branch));
    const current=branch.commit.sha;
    if(!isSha(current))throw new Error("Invalid GitHub branch SHA");
    if(!source.last_commit_sha){
      await db.query("UPDATE github_sources SET last_commit_sha=$2,last_sync_at=now(),last_sync_error=NULL WHERE id=$1 AND last_commit_sha IS NULL",
        [source.id,current]);
      return 0; // First activation establishes baseline without bulk backfill.
    }
    if(current===source.last_commit_sha){
      await db.query("UPDATE github_sources SET last_sync_at=now(),last_sync_error=NULL WHERE id=$1",[source.id]);
      return 0;
    }
    const commits=await collectComparison(config,repository,source.last_commit_sha,current);
    const client=await db.connect();
    try{
      await client.query("BEGIN");
      // Atomic cursor compare; concurrent syncs cannot rewind or advance over unknown commits.
      const moved=await client.query(
        "UPDATE github_sources SET last_commit_sha=$2,last_sync_at=now(),last_sync_error=NULL WHERE id=$1 AND last_commit_sha=$3 RETURNING id",
        [source.id,current,source.last_commit_sha]);
      if(!moved.rowCount)throw new Error("Cursor changed concurrently; retry sync");
      let inserted=0;
      for(const c of commits){
        const row=await client.query("INSERT INTO github_commits(repository,sha,author,title,url,committed_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING sha",
          [repository,c.sha,c.commit.author?.name??"Unknown",c.commit.message.split("\n")[0]?.slice(0,200)??"",
            c.html_url,c.commit.author?.date??new Date().toISOString()]);
        if(row.rowCount)inserted++;
      }
      if(inserted)await client.query(
        "INSERT INTO automation_jobs(kind,payload,run_at,dedup_key,origin) VALUES('github_push_summary',$1,$2,$3,'github_sync') ON CONFLICT(dedup_key) DO NOTHING",
        [JSON.stringify({repo:repository}),new Date(Date.now()+source.batch_minutes*60000).toISOString(),"push:"+repository]);
      await client.query("COMMIT");
      return inserted;
    }catch(e){await client.query("ROLLBACK");throw e;}
    finally{client.release();}
  }catch(e){
    await db.query("UPDATE github_sources SET last_sync_error=$2 WHERE id=$1",[source.id,e instanceof Error?e.message.slice(0,250):"Unknown sync error"]);
    throw e;
  }
}
type GithubRelease={id:number;tag_name:string;name:string;body:string;html_url:string;
  published_at:string|null;draft:boolean;prerelease:boolean;target_commitish?:string};
export async function fetchGithubRepository(db:DB,config:Config,repository:string):Promise<number>{
  const source=await db.query<{id:string;enabled_at:Date|null;allow_prereleases:boolean}>(
    "SELECT id,enabled_at,allow_prereleases FROM github_sources WHERE repository=$1 AND enabled AND release_enabled",[repository]);
  const settings=source.rows[0];
  if(!settings)return 0;
  if(!settings.enabled_at)throw new Error("Release source lacks activation date");
  let added=0,finished=false;
  try{
    for(let page=1;page<=10 && !finished;page++){
      const releases=await githubGet<GithubRelease[]>(config,repository,"/releases?per_page=100&page="+page);
      for(const release of releases){
        if(!release.published_at || new Date(release.published_at)<settings.enabled_at){finished=true;continue;}
        if(release.draft || (release.prerelease && !settings.allow_prereleases))continue;
        const row=await db.query(
          "INSERT INTO automation_jobs(kind,payload,dedup_key,origin) VALUES('github_release',$1,$2,'github_poll') ON CONFLICT(dedup_key) DO NOTHING RETURNING id",
          [JSON.stringify({repo:repository,releaseId:release.id,tag:release.tag_name,name:release.name,body:release.body,
            url:release.html_url,date:release.published_at,prerelease:release.prerelease,target:release.target_commitish}),
          "release:"+repository+":"+release.id]);
        if(row.rowCount)added++;
      }
      if(releases.length<100)finished=true;
    }
    if(!finished)throw new Error("Release pagination exceeded limit; manual review required");
    await db.query("UPDATE github_sources SET last_release_at=now(),last_sync_error=NULL WHERE id=$1",[settings.id]);
    return added;
  }catch(e){
    await db.query("UPDATE github_sources SET last_sync_error=$2 WHERE id=$1",[settings.id,e instanceof Error?e.message.slice(0,250):"Unknown release sync error"]);
    throw e;
  }
}
