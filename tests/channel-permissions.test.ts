import { test } from "node:test";
import { strict as assert } from "node:assert";
import { canUseChannel, evaluateChannel, type ChannelAction } from "../src/permissions.js";
import type { Identity } from "../src/auth.js";
import type { Config } from "../src/config.js";
import { IDS } from "../src/ids.js";

const config={BOT_TOKEN:"test",DISCORD_GUILD_ID:IDS.guild,ADMIN_ROLE_ID:IDS.admin} as Config;
const bits={view:1024n,send:2048n,reply:1n<<38n,createThread:1n<<35n,administrator:8n};
const dev:Identity={userId:"111111111111111111",roles:[IDS.roles.minecraft],csrfHash:""};
const make=(mode:ChannelAction,flags:bigint,overrides:unknown[]=[],actor=dev,department:"network"|"hosting"="network")=>
  evaluateChannel(config,actor,department,mode,{
    roles:[{id:IDS.guild,permissions:"0"},{id:IDS.roles.minecraft,permissions:String(flags)},{id:IDS.admin,permissions:"8"}],
    channel:{id:IDS.channels.network,type:15,permission_overwrites:overrides as []}
  });
test("forum: SendMessages without CreatePublicThreads is sufficient",()=>{
  assert.equal(make("write",bits.view|bits.send),true);
  assert.equal(make("write",bits.view|bits.createThread),false);
});
test("view never implies write",()=>{
  assert.equal(make("read",bits.view),true);
  assert.equal(make("write",bits.view),false);
});
test("department boundaries and ADMIN authority",()=>{
  assert.equal(make("read",bits.view,[],dev,"hosting"),false);
  assert.equal(make("write",0n,[],{...dev,roles:[IDS.admin]}),true);
});
test("member overrides and role denies are resolved in Discord order",()=>{
  const roleDeny=[{id:IDS.roles.minecraft,type:0,allow:"0",deny:String(bits.send)}];
  assert.equal(make("write",bits.view|bits.send,roleDeny),false);
  const memberAllow=[...roleDeny,{id:dev.userId,type:1,allow:String(bits.send),deny:"0"}];
  assert.equal(make("write",bits.view|bits.send,memberAllow),true);
  const memberDeny=[{id:dev.userId,type:1,allow:"0",deny:String(bits.view)}];
  assert.equal(make("read",bits.view|bits.send,memberDeny),false);
});
test("existing threads require SendMessagesInThreads",()=>{
  assert.equal(make("reply",bits.view|bits.send),false);
  assert.equal(make("reply",bits.view|bits.reply),true);
});
test("live REST failures and role changes fail closed",async()=>{
  const original=globalThis.fetch;
  try {
    globalThis.fetch=async()=>new Response("unavailable",{status:503});
    await assert.rejects(canUseChannel(config,dev,"network","write"));
    assert.equal(await canUseChannel(config,{...dev,roles:[]},"network","read"),false);
  } finally {globalThis.fetch=original;}
});
