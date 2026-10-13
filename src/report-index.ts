import type { Client, Message, ThreadChannel } from "discord.js";
import { ChannelType } from "discord.js";
import type { DB } from "./db.js";
import { transaction } from "./db.js";
import { confirmGithubPublication } from "./github-batches.js";
import { IDS, type DepartmentKey } from "./ids.js";
import type { Config } from "./config.js";

export type Source={id:string;channel_id:string;department:DepartmentKey;enabled:boolean;capture_content:boolean;historical_enabled:boolean};
export type Indexable={
 id:string;channelId:string;parentId:string|null;guildId:string|null;
 authorId:string|null;authorIsBot:boolean;content:string|null;
 createdAt:string;editedAt?:string|null;title:string|null;tags:string[];
 threadArchived?:boolean|null;threadLocked?:boolean|null;
 attachments:Array<{id:string;name:string;size:number;contentType:string|null}>;
};
export async function findSource(db:DB,channelId:string,parentId:string|null):Promise<Source|null>{
 const result=await db.query<Source>(
  "SELECT * FROM report_index_sources WHERE enabled AND channel_id=ANY($1::text[]) LIMIT 1",
  [[parentId,channelId].filter(Boolean)]);
 return result.rows[0]??null;
}
export function fromDiscordMessage(message:Message):Indexable{
 const thread=message.channel.isThread()?message.channel:null;
 return {
  id:message.id,channelId:message.channelId,parentId:thread?.parentId??null,
  guildId:message.guildId,authorId:message.author?.id??null,
  authorIsBot:message.author?.bot??false,content:message.content??null,
  createdAt:message.createdAt.toISOString(),editedAt:message.editedAt?.toISOString()??null,
  title:thread?.name??null,tags:thread?.appliedTags??[],
  threadArchived:thread?.archived??null,threadLocked:thread?.locked??null,
  attachments:message.attachments.map(a=>({id:a.id,name:a.name,size:a.size,contentType:a.contentType}))
 };
}
/** Use Discord's immutable guild/message IDs, never message text as an identity. */
export async function indexDiscordMessage(
 db:DB,source:Source,msg:Indexable,botUserId?:string
):Promise<"indexed"|"linked"|"ignored">{
 if(!source.enabled||msg.guildId!==IDS.guild)return "ignored";
 const isThread=msg.parentId===source.channel_id;
 if(!isThread && msg.channelId!==source.channel_id)return "ignored";
 // Only the thread's starter is a report. Replies remain attached to that report.
 if(isThread && msg.id!==msg.channelId)return "ignored";
 const reference=msg.authorIsBot && msg.authorId===botUserId
   ?msg.content?.match(/Ref: STUDIO-REPORT-(\d{1,20})/):null;
 if(reference){
  return transaction(db,async client=>{
    const result=await client.query<{id:string}>(
      "UPDATE reports SET discord_message_id=$2,discord_thread_id=$3,publication_status='published',"+
      "sync_state='complete',updated_at=now(),indexed_at=now(),last_index_event_at=now() "+
      "WHERE id=$1 AND discord_channel_id=$4 AND guild_id=$5 "+
      "AND (discord_message_id IS NULL OR discord_message_id=$2) RETURNING id",
      [reference[1],msg.id,isThread?msg.channelId:null,source.channel_id,IDS.guild]);
    if(!result.rows[0])return "ignored";
    const reportId=result.rows[0].id;
    await confirmGithubPublication(client,reportId);
    await client.query(
      "UPDATE automation_jobs SET status='done',completed_at=now(),remote_message_id=$2,remote_channel_id=$3 "+
      "WHERE kind='report_publish' AND payload->>'reportId'=$1 AND status IN ('queued','running','needs_reconciliation')",
      [reportId,msg.id,msg.channelId]);
    return "linked";
  });
 }
 // Never index an uncorrelated bot post as an independent manual report.
 if(msg.authorIsBot)return "ignored";
 const body=source.capture_content?msg.content??"":"";
 const known=source.capture_content&&msg.content!==null;
 const state=known?"available":"unavailable";
 const result=await db.query(
  "INSERT INTO reports(department,source,title,description,created_by,author_id,discord_channel_id,"+
  "discord_thread_id,discord_message_id,external_key,guild_id,publication_status,indexed_at,"+
  "content_state,sync_state,tags,attachments,origin_created_at,occurred_at,discord_edited_at,"+
  "thread_archived,thread_locked,last_index_event_at) "+
  "VALUES($1,'discord_manual',$2,$3,$4,$4,$5,$6,$7,NULL,$8,'indexed',now(),"+
  "$9,$10,$11,$12,$13,$13,$14,$15,$16,now()) "+
  "ON CONFLICT(guild_id,discord_message_id) WHERE discord_message_id IS NOT NULL DO UPDATE SET "+
  "updated_at=now(),last_index_event_at=now(),indexed_at=now(),"+
  "discord_thread_id=EXCLUDED.discord_thread_id,"+
  "title=CASE WHEN EXCLUDED.title<>'Publicación en Discord' THEN EXCLUDED.title ELSE reports.title END,"+
  "tags=EXCLUDED.tags,thread_archived=COALESCE(EXCLUDED.thread_archived,reports.thread_archived),"+
  "thread_locked=COALESCE(EXCLUDED.thread_locked,reports.thread_locked),"+
  "attachments=CASE WHEN EXCLUDED.content_state='available' THEN EXCLUDED.attachments ELSE reports.attachments END,"+
  "description=CASE WHEN EXCLUDED.content_state='available' AND "+
  "(reports.discord_edited_at IS NULL OR "+
  "(EXCLUDED.discord_edited_at IS NOT NULL AND EXCLUDED.discord_edited_at>=reports.discord_edited_at)) "+
  "THEN EXCLUDED.description ELSE reports.description END,"+
  "discord_edited_at=CASE WHEN EXCLUDED.discord_edited_at IS NULL THEN reports.discord_edited_at "+
  "WHEN reports.discord_edited_at IS NULL OR EXCLUDED.discord_edited_at>=reports.discord_edited_at "+
  "THEN EXCLUDED.discord_edited_at ELSE reports.discord_edited_at END,"+
  "content_state=CASE WHEN EXCLUDED.content_state='available' THEN 'available' ELSE reports.content_state END,"+
  "sync_state=CASE WHEN EXCLUDED.content_state='available' OR reports.content_state='available' THEN 'complete' ELSE 'partial' END "+
  "WHERE reports.deleted_at IS NULL AND reports.guild_id=EXCLUDED.guild_id "+
  "AND reports.discord_channel_id=EXCLUDED.discord_channel_id RETURNING id",
  [source.department,(msg.title||"Publicación en Discord").slice(0,100),body.slice(0,15000),
   msg.authorId,source.channel_id,isThread?msg.channelId:null,msg.id,IDS.guild,
   state,known?"complete":"partial",JSON.stringify(msg.tags),
   JSON.stringify(source.capture_content?msg.attachments:[]),msg.createdAt,
   msg.editedAt??null,msg.threadArchived??null,msg.threadLocked??null]);
 return result.rowCount?"indexed":"ignored";
}
export async function markDiscordDeletion(db:DB,messageId:string):Promise<void>{
 await db.query("UPDATE reports SET sync_state='deleted',publication_status='deleted',"+
  "deleted_at=now(),updated_at=now(),last_index_event_at=now() "+
  "WHERE guild_id=$1 AND discord_message_id=$2",[IDS.guild,messageId]);
}
export async function syncThreadMeta(db:DB,thread:ThreadChannel):Promise<void>{
 if(thread.guildId!==IDS.guild)return;
 await db.query(
  "UPDATE reports SET tags=$2,title=$4,thread_archived=$5,thread_locked=$6,updated_at=now(),last_index_event_at=now() "+
  "WHERE guild_id=$1 AND discord_thread_id=$3 AND deleted_at IS NULL",
  [IDS.guild,JSON.stringify(thread.appliedTags),thread.id,thread.name.slice(0,100),thread.archived,thread.locked]);
}
export function attachReportEvents(discord:Client,db:DB,config:Config):void{
 const guarded=(event:string,fn:()=>Promise<unknown>)=>void fn().catch(e=>
  console.error("report_index_event_error",{event,error:e instanceof Error?e.message.slice(0,200):"unknown"}));
 const handle=async(message:Message)=>{
  if(message.guildId!==config.DISCORD_GUILD_ID)return;
  const dto=fromDiscordMessage(message);
  const source=await findSource(db,dto.channelId,dto.parentId);
  if(source)await indexDiscordMessage(db,source,dto,config.DISCORD_CLIENT_ID);
 };
 discord.on("messageCreate",message=>guarded("create",()=>handle(message)));
 discord.on("messageUpdate",(_before,after)=>guarded("update",async()=>{
  if(!after.partial)await handle(after as Message);
 }));
 discord.on("messageDelete",msg=>guarded("delete",async()=>{
  if(msg.guildId!==config.DISCORD_GUILD_ID)return;
  const source=await findSource(db,msg.channelId,msg.channel.isThread()?msg.channel.parentId:null);
  if(source)await markDiscordDeletion(db,msg.id);
 }));
 discord.on("messageDeleteBulk",items=>guarded("bulk_delete",async()=>{
  for(const msg of items.values()){
   if(msg.guildId!==config.DISCORD_GUILD_ID)continue;
   const source=await findSource(db,msg.channelId,msg.channel.isThread()?msg.channel.parentId:null);
   if(source)await markDiscordDeletion(db,msg.id);
  }
 }));
 discord.on("threadCreate",thread=>guarded("thread_create",async()=>{
  if(thread.guildId!==config.DISCORD_GUILD_ID||
    (thread.parent?.type!==ChannelType.GuildForum&&thread.parent?.type!==ChannelType.GuildMedia))return;
  const source=await findSource(db,thread.id,thread.parentId);
  if(!source)return;
  const starter=await thread.fetchStarterMessage().catch(()=>null);
  if(starter)await handle(starter);
 }));
 discord.on("threadUpdate",(_before,after)=>guarded("thread_update",async()=>{
  if(after.guildId!==config.DISCORD_GUILD_ID)return;
  const source=await findSource(db,after.id,after.parentId);
  if(source)await syncThreadMeta(db,after);
 }));
 discord.on("threadDelete",thread=>guarded("thread_delete",async()=>{
  if(thread.guildId!==config.DISCORD_GUILD_ID)return;
  const source=await findSource(db,thread.id,thread.parentId);
  if(source)await db.query("UPDATE reports SET sync_state='missing',updated_at=now() "+
    "WHERE guild_id=$1 AND discord_thread_id=$2",[IDS.guild,thread.id]);
 }));
}
