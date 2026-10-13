import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Config } from "../src/config.js";
import { resolveTag,recordReleaseProvenance } from "../src/github-releases.js";
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url?.includes("studio_test")&&process.env.NODE_ENV==="test");
const sha=(n:number)=>n.toString(16).padStart(40,"0");
test("GitHub releases: annotated tags, verified SHA range and moved tag detection",{skip:!enabled},async()=>{
 const db=new pg.Pool({connectionString:url!,max:6});
 const repository="CI/releases-"+randomUUID();
 const original=globalThis.fetch;
 let move=false;
 const json=(x:unknown)=>new Response(JSON.stringify(x),{status:200});
 globalThis.fetch=async u=>{
  const url=String(u);
  if(url.includes("/git/ref/tags/v1.0"))return json({object:{sha:sha(11),type:"commit"}});
  if(url.includes("/git/ref/tags/v2.0"))return json({object:{sha:sha(333),type:"tag"}});
  if(url.includes("/git/tags/"+sha(333)))return json({object:{sha:move?sha(33):sha(22),type:"commit"}});
  if(url.includes("/compare/"))return json({status:"ahead",total_commits:2,commits:[
   {sha:sha(12),html_url:"https://github.com/test/commit/12",commit:{message:"Fix",author:{name:"CI",date:"2026-10-12T00:00:00Z"}}},
   {sha:sha(22),html_url:"https://github.com/test/commit/22",commit:{message:"Fix",author:{name:"CI",date:"2026-10-12T00:00:00Z"}}}
  ]});
  throw new Error("Unexpected GitHub mock route "+url);
 };
 const config={} as Config;
 try{
  const first=await resolveTag(config,repository,"v1.0");
  assert.equal(first.commitSha,sha(11));
  await recordReleaseProvenance(db,config,{repo:repository,releaseId:1,tag:"v1.0",name:"v1",
   body:"Official v1",url:"https://github.com/example/repo/releases/tag/v1.0",date:"2026-10-10T00:00:00Z"},null);
  await recordReleaseProvenance(db,config,{repo:repository,releaseId:2,tag:"v2.0",name:"v2",
   body:"Official v2",url:"https://github.com/example/repo/releases/tag/v2.0",date:"2026-10-12T00:00:00Z"},null);
  const relation=await db.query("SELECT relation_status,resolved_commit_sha,previous_release_id FROM github_release_records WHERE repository=$1 AND release_id=2",[repository]);
  assert.equal(relation.rows[0].relation_status,"verified");
  assert.equal(relation.rows[0].resolved_commit_sha,sha(22));
  assert.equal(String(relation.rows[0].previous_release_id),"1");
  const commits=await db.query("SELECT sha FROM github_release_commits WHERE repository=$1 AND release_id=2",[repository]);
  assert.equal(commits.rowCount,2);
  await recordReleaseProvenance(db,config,{repo:repository,releaseId:2,tag:"v2.0",name:"v2",
   body:"Edited official notes",url:"https://github.com/example/repo/releases/tag/v2.0",
   date:"2026-10-12T00:00:00Z",edited:true},null);
  const edited=await db.query("SELECT change_state FROM github_release_records WHERE repository=$1 AND release_id=2",[repository]);
  assert.equal(edited.rows[0].change_state,"edited_requires_review");
  move=true;
  await recordReleaseProvenance(db,config,{repo:repository,releaseId:2,tag:"v2.0",name:"v2",
   body:"Edited official notes",url:"https://github.com/example/repo/releases/tag/v2.0",
   date:"2026-10-12T00:00:00Z",edited:true},null);
  const moved=await db.query("SELECT relation_status,resolved_commit_sha,observed_commit_sha FROM github_release_records WHERE repository=$1 AND release_id=2",[repository]);
  assert.equal(moved.rows[0].relation_status,"tag_moved");
  assert.equal(moved.rows[0].resolved_commit_sha,sha(22),"original immutable verified ref must be preserved");
  assert.equal(moved.rows[0].observed_commit_sha,sha(33));
 }finally{
  globalThis.fetch=original;
  await db.query("DELETE FROM github_release_records WHERE repository=$1",[repository]);
  await db.end();
 }
});
