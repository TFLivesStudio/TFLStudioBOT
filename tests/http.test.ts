import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { DB } from "../src/db.js";
import type { Config } from "../src/config.js";
import type { Client } from "discord.js";
import { createHttp } from "../src/http.js";
import { IDS } from "../src/ids.js";

const config={
 LOG_LEVEL:"silent",CORS_ORIGIN:"http://localhost:3000",
 PUBLIC_API_URL:"http://localhost:8080",FRONTEND_URL:"http://localhost:3000",
 COOKIE_SECURE:false,DISCORD_CLIENT_ID:"1559294093962510386",
 DISCORD_GUILD_ID:IDS.guild,ADMIN_ROLE_ID:IDS.admin
} as unknown as Config;
const db={query:async()=>({rows:[{value:1}]})} as unknown as DB;
const discord={isReady:()=>true} as unknown as Client;

test("HTTP safety and public discovery smoke",async()=>{
 const app=await createHttp(config,db,discord);
 try{
  const live=await app.inject({method:"GET",url:"/api/v1/health/live"});
  assert.equal(live.statusCode,200);
  assert.equal(live.json().status,"ok");
  const spec=await app.inject({method:"GET",url:"/api/v1/openapi.json"});
  assert.equal(spec.statusCode,200);
  assert.equal(spec.json().openapi,"3.1.0");
  const denied=await app.inject({method:"GET",url:"/api/v1/billing"});
  assert.equal(denied.statusCode,401);
  const origin=await app.inject({method:"POST",url:"/api/v1/reports",headers:{"origin":"https://untrusted.example"},payload:{}});
  assert.equal(origin.statusCode,403);
  const csrf=await app.inject({method:"POST",url:"/api/v1/reports",headers:{"origin":config.CORS_ORIGIN},payload:{}});
  assert.equal(csrf.statusCode,401);
 }finally{await app.close();}
});
