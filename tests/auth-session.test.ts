import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { createHttp } from "../src/http.js";
import { csrfToken } from "../src/auth.js";
import { IDS } from "../src/ids.js";
import type { Config } from "../src/config.js";
import type { DB } from "../src/db.js";
import type { Client } from "discord.js";

test("OAuth session is live-scoped, tab-stable and CSRF protected",async()=>{
  const token="session-test-token";
  const secret="session-test-secret-must-be-longer-than-32-characters";
  let roleIds:string[]=[IDS.admin];
  let approved=true,memberExists=true,expired=false,networkError=false,revoked=false;
  const prev=globalThis.fetch;
  const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
  const expected=csrfToken(token,secret);
  const config={
    LOG_LEVEL:"silent",CORS_ORIGIN:"https://studio.tflives.com",
    FRONTEND_URL:"https://studio.tflives.com",
    PUBLIC_API_URL:"https://api.studio.tflives.com",
    COOKIE_SECURE:true,DISCORD_GUILD_ID:IDS.guild,ADMIN_ROLE_ID:IDS.admin,
    BOT_TOKEN:"fake",SESSION_SECRET:secret
  } as Config;
  const db={
    query:async(sql:string)=>{
      if(sql.startsWith("DELETE FROM sessions")){revoked=true;return {rows:[]};}
      if(sql.includes("FROM sessions WHERE"))return {rows:expired||revoked?[]:[{user_id:"111111111111111111",csrf_hash:hash(expected)}]};
      if(sql.startsWith("SELECT * FROM reports"))return {rows:[{department:"network",id:"1"}]};
      if(sql.includes("RETURNING id"))return {rows:[{id:"1"}],rowCount:1};
      return {rows:[],rowCount:0};
    }
  } as unknown as DB;
  const discord={isReady:()=>true} as unknown as Client;
  globalThis.fetch=async url=>{
    const u=String(url);
    if(networkError)return new Response("unavailable",{status:503});
    if(u.includes("/members/")){
      if(!memberExists)return new Response("missing",{status:404});
      return new Response(JSON.stringify({roles:roleIds,pending:!approved}),{status:200});
    }
    if(u.endsWith("/roles"))return new Response(JSON.stringify([
      {id:IDS.guild,permissions:"0"},{id:IDS.admin,permissions:"8"},{id:IDS.roles.hosting,permissions:"3072"}
    ]),{status:200});
    if(u.includes("/channels/"))return new Response(JSON.stringify({
      id:IDS.channels.hosting,type:0,permission_overwrites:[]}),{status:200});
    throw new Error("Unexpected mock HTTP call");
  };
  const app=await createHttp(config,db,discord);
  const cookie="tfl_studio_session="+token;
  const get=(url:string)=>app.inject({method:"GET",url,headers:{cookie}});
  const post=(csrf:string,origin=config.CORS_ORIGIN)=>app.inject({method:"POST",url:"/api/v1/billing",
    headers:{cookie,origin,"X-CSRF-Token":csrf},payload:{label:"Test",amountMinor:100,currency:"USD",category:"test"}});
  try{
    const first=await get("/api/v1/auth/me");
    const second=await get("/api/v1/auth/me");
    assert.equal(first.statusCode,200);
    assert.equal(first.json().csrfToken,second.json().csrfToken,"a second tab cannot invalidate the first");
    assert.equal(first.json().csrfToken,expected);
    assert.equal((await post(expected)).statusCode,200);
    assert.equal((await post("invalid")).statusCode,403);
    assert.equal((await post(expected,"https://malicious.example")).statusCode,403);
    roleIds=[IDS.roles.hosting];
    assert.equal((await get("/api/v1/billing")).statusCode,403,"loss of ADMIN takes effect immediately");
    assert.equal((await get("/api/v1/reports/1")).statusCode,403,"foreign department remains inaccessible");
    roleIds=[IDS.admin];
    approved=false;
    assert.equal((await get("/api/v1/billing")).statusCode,401,"pending member must not be authorized");
    approved=true;memberExists=false;
    assert.equal((await get("/api/v1/billing")).statusCode,401,"removed member loses access");
    memberExists=true;networkError=true;
    assert.equal((await get("/api/v1/billing")).statusCode,503,"transient Discord failure is fail-closed");
    networkError=false;expired=true;
    assert.equal((await get("/api/v1/billing")).statusCode,401,"expired session denied");
    expired=false;
    const out=await app.inject({method:"POST",url:"/api/v1/auth/logout",headers:{cookie,origin:config.CORS_ORIGIN,"X-CSRF-Token":expected},payload:{}});
    assert.equal(out.statusCode,200);
    assert.equal((await get("/api/v1/billing")).statusCode,401);
  }finally{globalThis.fetch=prev;await app.close();}
});
