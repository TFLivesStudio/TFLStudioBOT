import { test } from "node:test";
import { strict as assert } from "node:assert";
import { collectComparison, handleGithubEvent } from "../src/github.js";
import type { Config } from "../src/config.js";
import type { DB } from "../src/db.js";

const repository="TFLivesStudio/TFLClient";
const sha=(n:number)=>n.toString(16).padStart(40,"0");
const commit=(n:number)=>({sha:sha(n),html_url:"https://github.com/"+repository+"/commit/"+sha(n),
  commit:{message:"Commit "+n,author:{name:"Dev",date:"2026-10-12T12:00:00Z"}}});
test("GitHub comparison retrieves every page and preserves a complete SHA set",async()=>{
  const before=globalThis.fetch;
  const calls:string[]=[];
  try{
    globalThis.fetch=async url=>{
      const request=String(url); calls.push(request);
      const p=new URL(request).searchParams.get("page");
      const commits=p==="1"?Array.from({length:100},(_,i)=>commit(i+1)):Array.from({length:31},(_,i)=>commit(i+101));
      return new Response(JSON.stringify({status:"ahead",total_commits:131,commits}),{status:200});
    };
    const result=await collectComparison({} as Config,repository,sha(999),sha(998));
    assert.equal(result.length,131);
    assert.equal(new Set(result.map(x=>x.sha)).size,131);
    assert.equal(calls.length,2);
  }finally{globalThis.fetch=before;}
});
test("GitHub incomplete comparison fails rather than advancing a cursor",async()=>{
  const before=globalThis.fetch;
  try{
    globalThis.fetch=async()=>new Response(JSON.stringify({status:"ahead",total_commits:130,commits:[]}),{status:200});
    await assert.rejects(collectComparison({} as Config,repository,sha(1),sha(2)),/Incomplete/);
  }finally{globalThis.fetch=before;}
});
test("duplicated webhook deliveries are deduplicated and push queues a full sync",async()=>{
  const deliveries=new Set<string>();
  const jobs:string[]=[];
  const tx={
    query:async(sql:string,args:unknown[]=[])=>{
      if(sql.startsWith("INSERT INTO webhook_deliveries")){
        const delivery=String(args[0]);if(deliveries.has(delivery))return {rowCount:0,rows:[]};
        deliveries.add(delivery);return {rowCount:1,rows:[{delivery_id:delivery}]};
      }
      if(sql.startsWith("INSERT INTO automation_jobs")){jobs.push(String(args[1]));return {rowCount:1,rows:[]};}
      return {rowCount:1,rows:[]};
    },
    release:()=>{}
  };
  const db={
    query:async()=>({rows:[{id:"1",enabled:true,department:"client",default_branch:"main",
      repository_id:null,allow_prereleases:false,push_enabled:true,release_enabled:true}]}),
    connect:async()=>tx
  } as unknown as DB;
  const push={ref:"refs/heads/main",before:sha(1),after:sha(35),deleted:false,
    repository:{full_name:repository,id:100,default_branch:"other-branch"},
    commits:Array.from({length:20},(_,i)=>({id:sha(i+2),message:"commit",url:"https://github.com/test"}))};
  assert.equal(await handleGithubEvent(db,"push","delivery-1",push),"accepted");
  assert.equal(await handleGithubEvent(db,"push","delivery-1",push),"duplicate");
  assert.equal(jobs.length,1);
  assert.ok(jobs[0]?.startsWith("github_sync:"));
});
