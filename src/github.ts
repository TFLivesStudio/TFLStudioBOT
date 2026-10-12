import { createHmac, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import { audit } from "./audit.js";

export function verifyGitHubSignature(raw: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !/^sha256=[0-9a-f]{64}$/.test(signature)) return false;
  const actual = Buffer.from(signature.slice(7), "hex");
  const expected = createHmac("sha256", secret).update(raw).digest();
  return actual.length === expected.length && timingSafeEqual(actual,expected);
}
type GithubPush = {ref?:string; repository?:{full_name?:string;default_branch?:string}; commits?:Array<{id:string;message:string;url:string;author?:{name?:string};timestamp?:string}>};
type GithubRelease = {action?:string; repository?:{full_name?:string}; release?:{id:number;tag_name:string;name?:string;body?:string;html_url:string;published_at?:string;draft?:boolean;prerelease?:boolean}};
export async function handleGithubEvent(db: DB, event: string, delivery: string, payload: unknown): Promise<string> {
  if (!delivery || !/^[A-Za-z0-9-]{1,128}$/.test(delivery)) throw new Error("Invalid GitHub delivery ID");
  const p = payload as GithubPush & GithubRelease;
  const repo = p.repository?.full_name;
  if (!repo) return "ignored";
  const source = await db.query<{id:string;enabled:boolean;push_enabled:boolean;release_enabled:boolean;batch_minutes:number;department:string}>(
    "SELECT * FROM github_sources WHERE repository=$1", [repo]);
  const src = source.rows[0];
  if (!src || !src.enabled) return "disabled";
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const marker = await c.query("INSERT INTO webhook_deliveries(delivery_id,event_name) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING delivery_id",[delivery,event]);
    if (!marker.rowCount) { await c.query("COMMIT"); return "duplicate"; }
    if (event === "push" && src.push_enabled && p.ref === "refs/heads/" + p.repository?.default_branch) {
      for (const commit of (p.commits ?? []).slice(0,500)) {
        if (!/^[a-f0-9]{40}$/.test(commit.id)) continue;
        await c.query("INSERT INTO github_commits(repository,sha,author,title,url,committed_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
          [repo,commit.id,commit.author?.name ?? "Unknown",commit.message.split("\n")[0]?.slice(0,200) ?? "",commit.url,commit.timestamp ?? new Date().toISOString()]);
      }
      const due = new Date(Date.now()+src.batch_minutes*60000).toISOString();
      await c.query("INSERT INTO automation_jobs(kind,payload,run_at,dedup_key) VALUES('github_push_summary',$1,$2,$3) ON CONFLICT(dedup_key) DO NOTHING",
        [JSON.stringify({repo}),due,"push:"+repo]);
    }
    if (event === "release" && src.release_enabled && p.action === "published" && p.release && !p.release.draft) {
      const r = p.release;
      await c.query("INSERT INTO automation_jobs(kind,payload,dedup_key) VALUES('github_release',$1,$2) ON CONFLICT(dedup_key) DO NOTHING",
        [JSON.stringify({repo,releaseId:r.id,tag:r.tag_name,name:r.name,body:r.body ?? "",url:r.html_url,date:r.published_at}),"release:"+repo+":"+r.id]);
    }
    await c.query("COMMIT");
    return "accepted";
  } catch(e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
export async function fetchGithubRepository(db: DB, config: Config, repository: string): Promise<number> {
  const headers:Record<string,string>={"Accept":"application/vnd.github+json","User-Agent":"TFL-Studio-Core"};
  if(config.GITHUB_TOKEN) headers.Authorization="Bearer "+config.GITHUB_TOKEN;
  const res = await fetch("https://api.github.com/repos/"+repository+"/releases?per_page=15",{
    headers
  });
  if(!res.ok) throw new Error("GitHub poll error "+res.status);
  const releases = await res.json() as Array<{id:number;tag_name:string;name:string;body:string;html_url:string;published_at:string;draft:boolean}>;
  const source=await db.query<{enabled_at:Date|null}>("SELECT enabled_at FROM github_sources WHERE repository=$1",[repository]);
  const after=source.rows[0]?.enabled_at;
  let inserted=0;
  for (const r of releases.filter(r=>!r.draft && !!r.published_at && !!after && new Date(r.published_at)>=after)) {
    const result=await db.query("INSERT INTO automation_jobs(kind,payload,dedup_key) VALUES('github_release',$1,$2) ON CONFLICT DO NOTHING RETURNING id",
      [JSON.stringify({repo:repository,releaseId:r.id,tag:r.tag_name,name:r.name,body:r.body,url:r.html_url,date:r.published_at}),"release:"+repository+":"+r.id]);
    if(result.rowCount) inserted++;
  }
  return inserted;
}


/** Fallback for commit webhooks: establish cursor first, then compare main between successive polls. */
export async function pollGithubCommits(db:DB,config:Config,repository:string):Promise<number>{
  const entry=await db.query<{last_commit_sha:string|null;default_branch:string;batch_minutes:number}>("SELECT last_commit_sha,default_branch,batch_minutes FROM github_sources WHERE repository=$1 AND enabled AND push_enabled",[repository]);
  const source=entry.rows[0];
  if(!source) return 0;
  const headers:Record<string,string>={"Accept":"application/vnd.github+json","User-Agent":"TFL-Studio-Core"};
  if(config.GITHUB_TOKEN) headers.Authorization="Bearer "+config.GITHUB_TOKEN;
  const request=async(path:string)=>{
    const response=await fetch("https://api.github.com/repos/"+repository+path,{headers});
    if(!response.ok)throw new Error("GitHub poll "+response.status);
    return response.json();
  };
  const branch=await request("/branches/"+encodeURIComponent(source.default_branch)) as {commit:{sha:string}};
  const latest=branch.commit.sha;
  if(!/^[a-f0-9]{40}$/.test(latest))throw new Error("Invalid GitHub branch sha");
  if(!source.last_commit_sha){
    await db.query("UPDATE github_sources SET last_commit_sha=$2 WHERE repository=$1 AND last_commit_sha IS NULL",[repository,latest]);
    return 0; // Do not backfill an unbounded history on activation.
  }
  if(latest===source.last_commit_sha)return 0;
  const compared=await request("/compare/"+source.last_commit_sha+"..."+latest+"?per_page=100") as {
    status:string;total_commits:number;
    commits:Array<{sha:string;html_url:string;commit:{message:string;author:{name:string;date:string}|null}}>
  };
  if(compared.status!=="ahead" && compared.status!=="identical")throw new Error("Unexpected divergence: "+compared.status);
  if(compared.commits.length<compared.total_commits)throw new Error("Compare pagination needed; cursor preserved");
  const client=await db.connect();
  let inserted=0;
  try{
    await client.query("BEGIN");
    for(const c of compared.commits){
      const r=await client.query("INSERT INTO github_commits(repository,sha,author,title,url,committed_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING sha",
        [repository,c.sha,c.commit.author?.name??"Unknown",c.commit.message.split("\n")[0]?.slice(0,200)??"",c.html_url,c.commit.author?.date??new Date().toISOString()]);
      if(r.rowCount)inserted++;
    }
    await client.query("UPDATE github_sources SET last_commit_sha=$2 WHERE repository=$1",[repository,latest]);
    if(inserted)await client.query("INSERT INTO automation_jobs(kind,payload,run_at,dedup_key) VALUES('github_push_summary',$1,$2,$3) ON CONFLICT(dedup_key) DO NOTHING",
      [JSON.stringify({repo:repository}),new Date(Date.now()+source.batch_minutes*60000).toISOString(),"push:"+repository]);
    await client.query("COMMIT");
  }catch(e){await client.query("ROLLBACK");throw e;}
  finally{client.release();}
  return inserted;
}
