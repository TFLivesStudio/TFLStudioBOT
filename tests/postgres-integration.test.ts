import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import pg from "pg";
import type { Client } from "discord.js";
import { createReport } from "../src/reports.js";
import { runOneJob } from "../src/jobs.js";
import { indexDiscordMessage, markDiscordDeletion, type Source } from "../src/report-index.js";
import { IDS } from "../src/ids.js";
import { transaction } from "../src/db.js";

const url=process.env.TEST_DATABASE_URL;
const enabled=Boolean(url?.includes("studio_test") && process.env.NODE_ENV==="test");
test("PostgreSQL: outbox, claim concurrency, unique indexes and incremental report capture",{skip:!enabled},async t=>{
  const pool=new pg.Pool({connectionString:url!,max:8});
  const suffix=randomUUID();
  const key="test:"+suffix;
  const discordMessageId=String(900000000000000000n+BigInt(Math.floor(Math.random()*100000)));
  const client={channels:{fetch:async()=>({
    type:0,send:async()=>({id:discordMessageId,url:"https://discord.com/channels/"+IDS.guild+"/"+IDS.channels.hosting+"/"+discordMessageId})
  })}} as unknown as Client;
  const cleanup=async()=>{
    await pool.query("DELETE FROM automation_jobs WHERE dedup_key=$1 OR payload->>'reportId' IN (SELECT id::text FROM reports WHERE external_key=$2)",["report:"+key,key]);
    await pool.query("DELETE FROM reports WHERE external_key IN ($1,$2)",[key,"discord:"+discordMessageId]);
  };
  try{
    await t.test("same idempotency key creates exactly one report and job",async()=>{
      const jobs=await Promise.all(Array.from({length:3},()=>createReport(pool,client,"hosting","CI operation","Verified outbox", "111111111111111111",key)));
      assert.equal(new Set(jobs.map(j=>j.id)).size,1);
      assert.equal(jobs[0]?.status,"queued");
      const count=await pool.query("SELECT count(*)::int AS total FROM automation_jobs WHERE payload->>'reportId'=$1",[jobs[0]!.id]);
      assert.equal(count.rows[0].total,1);
      await assert.rejects(createReport(pool,client,"hosting","Other title","Verified outbox","111111111111111111",key),/Idempotency key/);
    });
    await t.test("two competing workers cannot both claim the same job",async()=>{
      let sends=0;
      const fake={channels:{fetch:async()=>({type:0,send:async()=>{
        sends++;
        await new Promise(resolve=>setTimeout(resolve,40));
        return {id:discordMessageId,url:"https://discord.com/channels/"+IDS.guild+"/"+IDS.channels.hosting+"/"+discordMessageId};
      }})}} as unknown as Client;
      await Promise.all([runOneJob(pool,fake),runOneJob(pool,fake)]);
      assert.equal(sends,1);
      const result=await pool.query("SELECT r.publication_status,j.status FROM reports r JOIN automation_jobs j ON j.payload->>'reportId'=r.id::text WHERE r.external_key=$1",[key]);
      assert.equal(result.rows[0].publication_status,"published");
      assert.equal(result.rows[0].status,"done");
    });
    await t.test("duplicate manual events upsert, not duplicate; deletion preserves history",async()=>{
      const msgId=String(BigInt(discordMessageId)+1n);
      const source:Source={id:"1",department:"hosting",channel_id:IDS.channels.hosting,enabled:true,capture_content:false,historical_enabled:false};
      const msg={id:msgId,guildId:IDS.guild,channelId:IDS.channels.hosting,parentId:null,
        authorId:"111111111111111111",authorIsBot:false,content:"PRIVATE DATA NOT TO STORE",
        createdAt:new Date().toISOString(),title:null,tags:[],attachments:[]};
      await Promise.all([indexDiscordMessage(pool,source,msg),indexDiscordMessage(pool,source,msg)]);
      const result=await pool.query("SELECT count(*)::int AS total,min(content_state) AS state,min(description) AS body FROM reports WHERE discord_message_id=$1",[msgId]);
      assert.equal(result.rows[0].total,1);
      assert.equal(result.rows[0].state,"unavailable");
      assert.equal(result.rows[0].body,"");
      await markDiscordDeletion(pool,msgId);
      const deleted=await pool.query("SELECT sync_state,deleted_at FROM reports WHERE discord_message_id=$1",[msgId]);
      assert.equal(deleted.rows[0].sync_state,"deleted");
      assert.ok(deleted.rows[0].deleted_at);
      await pool.query("DELETE FROM reports WHERE discord_message_id=$1",[msgId]);
    });
    await t.test("failed transactions roll back",async()=>{
      await assert.rejects(transaction(pool,async c=>{
        await c.query("INSERT INTO audit_events(action,target_kind,target_id) VALUES('test.rollback','test',$1)",[suffix]);
        throw new Error("intended failure");
      }),/intended failure/);
      const result=await pool.query("SELECT 1 FROM audit_events WHERE action='test.rollback' AND target_id=$1",[suffix]);
      assert.equal(result.rowCount,0);
    });
  }finally{
    await cleanup();
    await pool.end();
  }
});
