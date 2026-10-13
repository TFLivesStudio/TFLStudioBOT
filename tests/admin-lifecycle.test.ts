import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHash,randomBytes } from "node:crypto";
import pg from "pg";
import type { Config } from "../src/config.js";
import type { Client } from "discord.js";
import { IDS } from "../src/ids.js";
import { csrfToken } from "../src/auth.js";
import { createHttp } from "../src/http.js";
import { executeConfiguredAutomation } from "../src/automations.js";
const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url?.includes("studio_test") && process.env.NODE_ENV==="test");
const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
test("ADMIN API lifecycle: announcements, versioned guides, exact Billing and safe automation",{skip:!enabled},async t=>{
 const db=new pg.Pool({connectionString:url!,max:8});
 const originalFetch=globalThis.fetch;
 const userId="111111111111111111",secret="test-session-secret-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
 const token=randomBytes(24).toString("hex"),csrf=csrfToken(token,secret);
 const origin="http://localhost:3000";
 let admin=true,pending=false;
 const config={
  LOG_LEVEL:"silent",CORS_ORIGIN:origin,FRONTEND_URL:origin,PUBLIC_API_URL:"http://localhost:8080",
  COOKIE_SECURE:false,BOT_TOKEN:"CI_FAKE_DISCORD_BOT",
  SESSION_SECRET:secret,DISCORD_GUILD_ID:IDS.guild,ADMIN_ROLE_ID:IDS.admin,
  DISCORD_CLIENT_ID:"1559294093962510386"
 } as Config;
 globalThis.fetch=async u=>{
  const path=String(u);
  if(path.includes("/members/"))return new Response(JSON.stringify({roles:admin?[IDS.admin]:[IDS.roles.hosting],pending}),{status:200});
  if(path.endsWith("/roles"))return new Response(JSON.stringify([
   {id:IDS.guild,permissions:"1024"},{id:IDS.admin,permissions:"8"},{id:IDS.roles.hosting,permissions:"3072"}]),{status:200});
  if(path.includes("/channels/"))return new Response(JSON.stringify({id:IDS.channels.hosting,type:0,permission_overwrites:[]}),{status:200});
  throw Error("Unexpected external call: "+path);
 };
 const discord={isReady:()=>true,channels:{fetch:async()=>null}} as unknown as Client;
 let app:Awaited<ReturnType<typeof createHttp>>|null=null;
 const ids:{ann?:string;guide?:string;record?:string;subscription?:string;automation?:string;template?:string}={};
 try{
  await db.query("INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '2 hours')",
   [digest(token),userId,digest(csrf)]);
  app=await createHttp(config,db,discord);
  const cookie="tfl_studio_session="+token;
  const get=async(path:string)=>app!.inject({method:"GET",url:path,headers:{cookie}});
  const post=async(path:string,payload:unknown,method:"POST"|"PATCH"="POST",key?:string)=>app!.inject({
   method,url:path,headers:{cookie,origin,"x-csrf-token":csrf,...(key?{"idempotency-key":key}:{})},payload:payload as object
  });
  await t.test("announcement validation, edit, schedule, cancel and preview",async()=>{
   const created=await post("/api/v1/announcements",{
    targetChannelId:IDS.channels.anuncios,title:"CI announcement",body:"News",
    visual:{embeds:[{title:"Visual title",description:"Visual description",image:"https://example.org/img.png"}]}
   });
   assert.equal(created.statusCode,200,created.body);ids.ann=created.json().id;
   assert.equal((await get("/api/v1/announcements/"+ids.ann+"/preview")).statusCode,200);
   assert.equal((await post("/api/v1/announcements/"+ids.ann,{
    targetChannelId:IDS.channels.anuncios,title:"Edited",body:"Message",visual:{embeds:[]},expectedVersion:1
   },"PATCH")).statusCode,200);
   const when=new Date(Date.now()+3_600_000).toISOString();
   assert.equal((await post("/api/v1/announcements/"+ids.ann+"/schedule",{runAt:when,confirm:true})).statusCode,200);
   assert.equal((await post("/api/v1/announcements/"+ids.ann+"/cancel",{reason:"Cancelled for integration test"})).statusCode,200);
   const state=await db.query("SELECT status FROM announcements WHERE id=$1",[ids.ann]);
   assert.equal(state.rows[0].status,"cancelled");
   const template=await post("/api/v1/announcements/templates",{name:"CI template "+token.slice(0,10),visual:{embeds:[]}});
   assert.equal(template.statusCode,200);ids.template=template.json().id;
   assert.equal((await post("/api/v1/announcements/templates/"+ids.template+"/disable",{})).statusCode,200);
  });
  await t.test("guide revisions and optimistic lock protect concurrent writers",async()=>{
   const created=await post("/api/v1/guides",{title:"CI guide",body:"Original body",category:"Test",visibilityDepartment:null});
   assert.equal(created.statusCode,200,created.body);ids.guide=created.json().id;
   const path="/api/v1/guides/"+ids.guide;
   assert.equal((await post(path,{expectedVersion:1,title:"Edited guide",body:"Edited body",category:"Test",visibilityDepartment:null},"PATCH")).statusCode,200);
   assert.equal((await post(path,{expectedVersion:1,title:"Stale",body:"Old",category:"Test",visibilityDepartment:null},"PATCH")).statusCode,409);
   const revisions=await get(path+"/revisions");
   assert.equal(revisions.statusCode,200);assert.ok(revisions.json().revisions.length>0);
   const restored=await post(path+"/restore",{expectedVersion:2,restoreVersion:1});
   assert.equal(restored.statusCode,200);assert.equal(restored.json().version,3);
   assert.equal((await post(path+"/archive",{expectedVersion:3})).statusCode,200);
   const stored=await db.query("SELECT lifecycle,title,version FROM guides WHERE id=$1",[ids.guide]);
   assert.equal(stored.rows[0].lifecycle,"archived");assert.equal(stored.rows[0].title,"CI guide");
  });
  await t.test("Billing mutations preserve version, exact minor units and snapshots",async()=>{
   const created=await post("/api/v1/billing",{
    label:"CI record",amountMinor:100099,currency:"COP",category:"CI",notes:"Recorded only"
   });
   assert.equal(created.statusCode,200,created.body);ids.record=created.json().id;
   assert.equal((await post("/api/v1/billing/"+ids.record,{
    expectedVersion:1,label:"CI record updated",amountMinor:100100,currency:"COP",category:"CI",
    notes:"Updated",status:"active",dueAt:null,reason:"Test update verification"
   },"PATCH")).statusCode,200);
   assert.equal((await post("/api/v1/billing/"+ids.record,{
    expectedVersion:1,label:"Stale",amountMinor:99,currency:"COP",category:"CI",
    notes:"Old",status:"active",dueAt:null,reason:"Stale concurrent writer"
   },"PATCH")).statusCode,409);
   const history=await get("/api/v1/billing/history?kind=record&id="+ids.record);
   assert.equal(history.statusCode,200);assert.equal(history.json().items.length,2);
   const amount=await db.query("SELECT amount_minor::text AS amount FROM billing_records WHERE id=$1",[ids.record]);
   assert.equal(amount.rows[0].amount,"100100");
   const createdSub=await post("/api/v1/billing/subscriptions",{
    label:"CI subscription",provider:"CI",amountMinor:1900,currency:"USD",cadenceMonths:1,
    nextDueAt:new Date(Date.now()+60_000).toISOString(),notes:"Test"
   });
   assert.equal(createdSub.statusCode,200,createdSub.body);ids.subscription=createdSub.json().id;
   const changed=await post("/api/v1/billing/subscriptions/"+ids.subscription,{
    expectedVersion:1,label:"CI subscription",provider:"CI",amountMinor:2000,currency:"USD",
    cadenceMonths:3,nextDueAt:new Date(Date.now()+90_000).toISOString(),status:"paused",
    notes:"Adjusted",reason:"Cycle change during regression"
   },"PATCH");
   assert.equal(changed.statusCode,200,changed.body);
   const summary=await get("/api/v1/billing/summary");
   assert.equal(summary.statusCode,200);
   assert.equal(summary.json().exchangeRatesApplied,false);
  });
  await t.test("typed automations remain off until explicitly enabled",async()=>{
   const created=await post("/api/v1/automations",{
    name:"CI admin notice "+token.slice(0,12),kind:"admin_notice",description:"test",
    triggerKind:"manual",intervalMinutes:null,config:{message:"CI run without Discord"}
   });
   assert.equal(created.statusCode,200,created.body);ids.automation=created.json().id;
   assert.equal(created.json().enabled,false);
   assert.equal((await post("/api/v1/automations/"+ids.automation+"/run",{confirm:true}, "POST","manualci123456")).statusCode,409);
   const enabledResult=await post("/api/v1/automations/"+ids.automation+"/enable",{expectedVersion:1,enabled:true});
   assert.equal(enabledResult.statusCode,200,enabledResult.body);
   const queued=await post("/api/v1/automations/"+ids.automation+"/run",{confirm:true},"POST","manualci123456");
   assert.equal(queued.statusCode,200,queued.body);
   const duplicate=await post("/api/v1/automations/"+ids.automation+"/run",{confirm:true},"POST","manualci123456");
   assert.equal(duplicate.json().jobId,queued.json().jobId);
   const outcome=await executeConfiguredAutomation(db,config,queued.json().jobId,{ruleId:ids.automation,version:2});
   assert.equal(outcome,"completed");
   const notes=await get("/api/v1/automations/notifications");
   assert.equal(notes.statusCode,200);
   assert.ok(notes.json().items.some((x:{message:string})=>x.message==="CI run without Discord"));
  });
  await t.test("roles, CSRF and session scope restrict confidential records",async()=>{
   admin=false;
   assert.equal((await get("/api/v1/billing")).statusCode,403);
   assert.equal((await get("/api/v1/automations")).statusCode,403);
   admin=true;pending=true;
   assert.equal((await get("/api/v1/billing")).statusCode,401);
   pending=false;
   const invalid=await app!.inject({method:"POST",url:"/api/v1/automations",headers:{cookie,origin,"x-csrf-token":"bad"},
    payload:{name:"Forbidden",kind:"maintenance",triggerKind:"manual",intervalMinutes:null,config:{operation:"prune_expired_sessions"}}});
   assert.equal(invalid.statusCode,403);
  });
 }finally{
  if(app)await app.close();
  globalThis.fetch=originalFetch;
  if(ids.automation){
   await db.query("DELETE FROM admin_notifications WHERE source_job_id IN (SELECT id FROM automation_jobs WHERE automation_id=$1)",[ids.automation]);
   await db.query("DELETE FROM job_attempts WHERE job_id IN (SELECT id FROM automation_jobs WHERE automation_id=$1)",[ids.automation]);
   await db.query("DELETE FROM automation_jobs WHERE automation_id=$1",[ids.automation]);
   await db.query("DELETE FROM automation_definitions WHERE id=$1",[ids.automation]);
  }
  if(ids.ann){
   await db.query("DELETE FROM job_attempts WHERE job_id IN (SELECT id FROM automation_jobs WHERE payload->>'id'=$1 AND kind='announcement')",[ids.ann]);
   await db.query("DELETE FROM automation_jobs WHERE payload->>'id'=$1 AND kind='announcement'",[ids.ann]);
   await db.query("DELETE FROM announcements WHERE id=$1",[ids.ann]);
  }
  if(ids.template)await db.query("DELETE FROM announcement_templates WHERE id=$1",[ids.template]);
  if(ids.guide){
   await db.query("DELETE FROM guide_revisions WHERE guide_id=$1",[ids.guide]);
   await db.query("DELETE FROM guides WHERE id=$1",[ids.guide]);
  }
  if(ids.record){
   await db.query("DELETE FROM billing_change_history WHERE resource_kind='record' AND resource_id=$1",[ids.record]);
   await db.query("DELETE FROM billing_records WHERE id=$1",[ids.record]);
  }
  if(ids.subscription){
   await db.query("DELETE FROM billing_change_history WHERE resource_kind='subscription' AND resource_id=$1",[ids.subscription]);
   await db.query("DELETE FROM billing_subscriptions WHERE id=$1",[ids.subscription]);
  }
  await db.query("DELETE FROM audit_events WHERE actor_id=$1 AND occurred_at>=now()-interval '30 minutes'",[userId]);
  await db.query("DELETE FROM sessions WHERE token_hash=$1",[digest(token)]);
  await db.end();
 }
});
