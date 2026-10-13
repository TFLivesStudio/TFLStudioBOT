import type { Client, Message, ThreadChannel } from "discord.js";
import { ChannelType } from "discord.js";
import type { DB } from "./db.js";
import { IDS, DEPARTMENTS, type DepartmentKey } from "./ids.js";
import type { Config } from "./config.js";

export type Source = {id:string;channel_id:string;department:DepartmentKey;enabled:boolean;capture_content:boolean;historical_enabled:boolean};
export type Indexable = {
  id:string; channelId:string; parentId:string|null; guildId:string|null;
  authorId:string|null; authorIsBot:boolean; content:string|null;
  createdAt:string; title:string|null; tags:string[];
  attachments:Array<{id:string;name:string;size:number;contentType:string|null}>;
};
export async function findSource(db:DB,channelId:string,parentId:string|null):Promise<Source|null>{
  const source=await db.query<Source>("SELECT * FROM report_index_sources WHERE enabled AND channel_id=ANY($1::text[]) LIMIT 1",[[parentId,channelId].filter(Boolean)]);
  return source.rows[0]??null;
}
export function fromDiscordMessage(message:Message):Indexable{
  const thread=message.channel.isThread()?message.channel:null;
  return {
    id:message.id,channelId:message.channelId,parentId:thread?.parentId??null,
    guildId:message.guildId,authorId:message.author?.id??null,
    authorIsBot:message.author?.bot??false,
    content:message.content||null,createdAt:message.createdAt.toISOString(),
    title:thread?.name??null,tags:thread?.appliedTags??[],
    attachments:message.attachments.map(a=>({id:a.id,name:a.name,size:a.size,contentType:a.contentType}))
  };
}
/** Metadata only by default. Own bot messages reattach to existing reports via explicit marker. */
export async function indexDiscordMessage(db:DB,source:Source,msg:Indexable):Promise<"indexed"|"linked"|"ignored">{
  if(!source.enabled || msg.guildId!==IDS.guild)return "ignored";
  const isThread=msg.parentId===source.channel_id;
  if(!isThread && msg.channelId!==source.channel_id)return "ignored";
  // A forum's thread starter is a report; subsequent replies are not separate reports.
  if(isThread && msg.id!==msg.channelId)return "ignored";
  const own=msg.authorIsBot && msg.content?.match(/Ref: STUDIO-REPORT-(\d+)/);
  if(own){
    const result=await db.query(
      "UPDATE reports SET discord_message_id=$2,discord_thread_id=$3,publication_status='published',sync_state='complete',updated_at=now(),indexed_at=now() WHERE id=$1 AND discord_channel_id=$4 AND (discord_message_id IS NULL OR discord_message_id=$2) RETURNING id",
      [own[1],msg.id,isThread?msg.channelId:null,source.channel_id]);
    if(result.rowCount)return "linked";
  }
  if(msg.authorIsBot)return "ignored"; // do not create a second record for an uncorrelated bot write
  const content=source.capture_content?msg.content??"":"";
  const state=source.capture_content&&msg.content!==null?"available":"unavailable";
  const title=(msg.title||"Publicación en Discord").slice(0,100);
  const row=await db.query(
    "INSERT INTO reports(department,source,title,description,created_by,author_id,discord_channel_id,discord_thread_id,discord_message_id,external_key,guild_id,publication_status,indexed_at,content_state,sync_state,tags,attachments,origin_created_at,occurred_at) "+
    "VALUES($1,'discord_manual',$2,$3,$4,$4,$5,$6,$7,$8,$9,'indexed',now(),$10,$11,$12,$13,$14,$14) "+
    "ON CONFLICT(external_key) DO UPDATE SET "+
    "discord_thread_id=EXCLUDED.discord_thread_id,updated_at=now(),indexed_at=now(),"+
    "tags=EXCLUDED.tags,attachments=EXCLUDED.attachments,content_state=EXCLUDED.content_state,"+
    "sync_state=EXCLUDED.sync_state,description=CASE WHEN EXCLUDED.content_state='available' THEN EXCLUDED.description ELSE reports.description END "+
    "WHERE reports.deleted_at IS NULL AND reports.guild_id=EXCLUDED.guild_id AND reports.discord_channel_id=EXCLUDED.discord_channel_id RETURNING id",
    [source.department,title,content.slice(0,15000),msg.authorId,source.channel_id,isThread?msg.channelId:null,msg.id,
      "discord:"+msg.id,IDS.guild,state,state==="available"?"complete":"partial",
      JSON.stringify(msg.tags),JSON.stringify(source.capture_content?msg.attachments:[]),msg.createdAt]);
  return row.rowCount?"indexed":"ignored";
}
export async function markDiscordDeletion(db:DB,messageId:string):Promise<void>{
  await db.query("UPDATE reports SET sync_state='deleted',publication_status='deleted',deleted_at=now(),updated_at=now() WHERE guild_id=$1 AND discord_message_id=$2",[IDS.guild,messageId]);
}
export async function syncThreadMeta(db:DB,thread:ThreadChannel):Promise<void>{
  if(thread.guildId!==IDS.guild)return;
  await db.query("UPDATE reports SET tags=$2,updated_at=now() WHERE guild_id=$1 AND discord_thread_id=$3",
    [IDS.guild,JSON.stringify(thread.appliedTags),thread.id]);
}
export function attachReportEvents(discord:Client,db:DB,config:Config):void{
  const handle=async(message:Message)=>{
    if(message.guildId!==config.DISCORD_GUILD_ID)return;
    const dto=fromDiscordMessage(message);
    const source=await findSource(db,dto.channelId,dto.parentId);
    if(!source)return;
    await indexDiscordMessage(db,source,dto);
  };
  const guarded=(label:string,fn:()=>Promise<unknown>)=>void fn().catch(e=>console.error("report_index_"+label,e instanceof Error?e.message:"unknown"));
  discord.on("messageCreate",message=>guarded("create",()=>handle(message)));
  discord.on("messageUpdate",(_before,after)=>{
    guarded("update",async()=>{
      if(after.partial){
        // Partial events cannot safely overwrite unknown fields with blanks.
        return;
      }
      await handle(after as Message);
    });
  });
  discord.on("messageDelete",msg=>guarded("delete",async()=>{
    if(msg.guildId!==config.DISCORD_GUILD_ID)return;
    const source=await findSource(db,msg.channelId,msg.channel.isThread()?msg.channel.parentId:null);
    if(source)await markDiscordDeletion(db,msg.id);
  }));
  discord.on("threadCreate",thread=>guarded("thread_create",async()=>{
    if(thread.guildId!==config.DISCORD_GUILD_ID || (thread.parent?.type!==ChannelType.GuildForum && thread.parent?.type!==ChannelType.GuildMedia))return;
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
}
