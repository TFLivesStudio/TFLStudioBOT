import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { Config } from "../src/config.js";
import type { DB } from "../src/db.js";
import type { Client } from "discord.js";
import { IDS } from "../src/ids.js";
import { OPENAPI } from "../src/openapi.js";
import { createHttp } from "../src/http.js";

test("OpenAPI 0.3.0 documents every registered route and validates its referenced schemas",async()=>{
 const config={
  LOG_LEVEL:"silent",CORS_ORIGIN:"http://localhost:3000",FRONTEND_URL:"http://localhost:3000",
  PUBLIC_API_URL:"http://localhost:8080",COOKIE_SECURE:false,
  ADMIN_ROLE_ID:IDS.admin,DISCORD_GUILD_ID:IDS.guild
 } as Config;
 const db={query:async()=>({rows:[],rowCount:0})} as unknown as DB;
 const client={isReady:()=>true} as unknown as Client;
 const app=await createHttp(config,db,client);
 try{
  assert.equal(OPENAPI.openapi,"3.1.0");
  assert.equal(OPENAPI.info.version,"0.3.0");
  const paths=OPENAPI.paths as Record<string,Record<string,{requestBody?:{content:Record<string,{schema:{$ref?:string}}>};
    security:unknown[];responses:Record<string,unknown>;parameters?:unknown[]}>>;
  assert.ok(Object.keys(paths).length>=70,"0.3 API includes administrative route modules");
  for(const [path,methods] of Object.entries(paths)){
   const url=path.replaceAll("{id}",":id");
   for(const [method,definition] of Object.entries(methods)){
    assert.equal(app.hasRoute({method:method.toUpperCase() as "GET"|"POST"|"PATCH"|"PUT"|"DELETE",url}),
      true,"OpenAPI declares a real Fastify route: "+method+" "+path);
    assert.ok(definition.responses["200"],"missing success response: "+path);
    for(const code of ["400","401","403","409","429","500"])assert.ok(definition.responses[code],
      "missing error response "+code+" on "+path);
    const schema=definition.requestBody?.content["application/json"]?.schema;
    if(schema?.$ref)assert.ok(schema.$ref.replace("#/components/schemas/","") in OPENAPI.components.schemas,
      "unresolved requestBody reference: "+schema.$ref);
    const isProtected=![
      "/api/v1/health/live","/api/v1/health/ready","/api/v1/openapi.json",
      "/api/v1/auth/login","/api/v1/auth/callback","/api/v1/integrations/github/webhook"
    ].includes(path);
    assert.equal(definition.security.length>0,isProtected,"session security mismatch: "+path);
   }
  }
  // Guard the most consequential API additions against accidental documentation removal.
  const essential=[
   "/api/v1/reports/export","/api/v1/diagnostics",
   "/api/v1/automations/{id}/run","/api/v1/announcements/{id}/publish-now",
   "/api/v1/guides/{id}/restore","/api/v1/billing/history",
   "/api/v1/report-index/imports/recover","/api/v1/github/releases/{id}/commits"
  ];
  for(const path of essential)assert.ok(paths[path],"missing critical 0.3 route "+path);
 }finally{await app.close();}
});
