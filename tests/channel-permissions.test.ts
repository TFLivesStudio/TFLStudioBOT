import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canUseChannel } from "../src/permissions.js";
import type { Identity } from "../src/auth.js";
import type { Config } from "../src/config.js";
import { IDS } from "../src/ids.js";
const config={
 BOT_TOKEN:"fake_bot_token",
 DISCORD_GUILD_ID:IDS.guild,
 ADMIN_ROLE_ID:IDS.admin
} as Config;
test("channel overwrites restrict department access even with matching role",async()=>{
 const globalFetch=globalThis.fetch;
 const role=IDS.roles.minecraft;
 const user:Identity={userId:"111111111111111111",roles:[role],csrfHash:""};
 try{
  globalThis.fetch=async (url)=>{
   const asString=String(url);
   const data=asString.endsWith("/roles")?[
    {id:IDS.guild,permissions:"1024"},{id:role,permissions:"3072"}
   ]:{
    id:IDS.channels.network,type:15,
    permission_overwrites:[
     {id:IDS.guild,type:0,allow:"0",deny:"1024"},
     {id:role,type:0,allow:"1024",deny:"0"}
    ]
   };
   return new Response(JSON.stringify(data),{status:200,headers:{"content-type":"application/json"}});
  };
  assert.equal(await canUseChannel(config,user,"network","read"),true);
  assert.equal(await canUseChannel(config,user,"network","write"),false);
  assert.equal(await canUseChannel(config,user,"hosting","read"),false);
 } finally {globalThis.fetch=globalFetch;}
});
