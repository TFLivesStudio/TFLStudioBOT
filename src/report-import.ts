import type { DB } from "./db.js";
import type { Config } from "./config.js";
import { IDS } from "./ids.js";
import { indexDiscordMessage, type Indexable, type Source } from "./report-index.js";

type DiscordMessage = {
  id:string;channel_id:string;content?:string;timestamp:string;
  author?:{id:string;bot:boolean};attachments?:Array<{id:string;filename:string;size:number;content_type?:string}>;
};
type DiscordThread = {id:string;parent_id:string;name:string;applied_tags?:string[];thread_metadata?:{archive_timestamp?:string}};
const userAgent="TFL-Studio-Core/1.0";
async function discordApi<T>(config:Config,path:string):Promise<T>{
  const url="https://discord.com/api/v10"+path;
  for(let tries=0;tries<3;tries++){
    const res=await fetch(url,{headers:{Authorization:"Bot "+config.BOT_TOKEN,"User-Agent":userAgent},signal:AbortSignal.timeout(20000)});
    if(res.status===429 && tries<2){
      const retry=Math.min(5000,Math.max(500,Number(res.headers.get("Retry-After")??1)*1000));
      await new Promise<void>(resolve=>setTimeout(resolve,retry));
      continue;
    }
    if(!res.ok)throw Object.assign(new Error("Discord import HTTP "+res.status),{httpStatus:res.status});
    return res.json() as Promise<T>;
  }
  throw new Error("Discord retries exhausted");
}
const toIndexable=(msg:DiscordMessage,source:Source,thread?:DiscordThread):Indexable=>({
  id:msg.id,channelId:msg.channel_id,parentId:thread?source.channel_id:null,
  guildId:IDS.guild,authorId:msg.author?.id??null,authorIsBot:msg.author?.bot??false,
  content:source.capture_content?msg.content??null:null,createdAt:msg.timestamp,
  title:thread?.name??null,tags:thread?.applied_tags??[],
  attachments:(msg.attachments??[]).map(a=>({id:a.id,name:a.filename,size:a.size,contentType:a.content_type??null}))
});
type Run={id:string;source_id:string;status:string;dry_run:boolean;cursor:string|null;phase:string;processed:number;inserted:number;errors:number};
export async function runImportBatch(db:DB,config:Config,id:string):Promise<"more"|"done">{
  const result=await db.query<Run>("SELECT * FROM report_import_runs WHERE id=$1",[id]);
  const run=result.rows[0];
  if(!run || run.status!=="running")return "done";
  const src=await db.query<Source>("SELECT * FROM report_index_sources WHERE id=$1 AND enabled AND historical_enabled",[run.source_id]);
  const source=src.rows[0];
  if(!source){
    await db.query("UPDATE report_import_runs SET status='paused',last_error='Source disabled for history' WHERE id=$1",[id]);
    return "done";
  }
  const forum=["network","client","tflweb","webBrillara"].includes(source.department);
  let phase=run.phase,cursor=run.cursor;
  let processed=0,inserted=0,finished=false;
  try{
    if(!forum){
      const params=new URLSearchParams({limit:"25"});
      if(cursor)params.set("before",cursor);
      const messages=await discordApi<DiscordMessage[]>(config,"/channels/"+source.channel_id+"/messages?"+params);
      for(const msg of messages){
        processed++;
        if(!run.dry_run && await indexDiscordMessage(db,source,toIndexable(msg,source))==="indexed")inserted++;
      }
      if(messages.length)cursor=messages[messages.length-1]!.id;
      finished=messages.length<25;
    }else if(phase==="start" || phase==="active"){
      phase="active";
      const response=await discordApi<{threads:DiscordThread[]}>(config,"/guilds/"+IDS.guild+"/threads/active");
      const threads=response.threads.filter(t=>t.parent_id===source.channel_id).sort((a,b)=>a.id.localeCompare(b.id));
      const selected=threads.filter(t=>!cursor || t.id>cursor).slice(0,15);
      for(const thread of selected){
        processed++;
        try{
          const starter=await discordApi<DiscordMessage>(config,"/channels/"+thread.id+"/messages/"+thread.id);
          if(!run.dry_run && await indexDiscordMessage(db,source,toIndexable(starter,source,thread))==="indexed")inserted++;
        }catch{
          await db.query("UPDATE report_import_runs SET errors=errors+1,last_error='An accessible thread starter could not be retrieved' WHERE id=$1",[id]);
        }
      }
      if(selected.length)cursor=selected[selected.length-1]!.id;
      if(selected.length<15){phase="archived";cursor=null;}
    }else{
      phase="archived";
      const params=new URLSearchParams({limit:"25"});
      if(cursor)params.set("before",cursor);
      const response=await discordApi<{threads:DiscordThread[];has_more:boolean}>(config,
        "/channels/"+source.channel_id+"/threads/archived/public?"+params);
      for(const thread of response.threads){
        processed++;
        try{
          const starter=await discordApi<DiscordMessage>(config,"/channels/"+thread.id+"/messages/"+thread.id);
          if(!run.dry_run && await indexDiscordMessage(db,source,toIndexable(starter,source,thread))==="indexed")inserted++;
        }catch{
          await db.query("UPDATE report_import_runs SET errors=errors+1,last_error='Archived thread starter unavailable' WHERE id=$1",[id]);
        }
      }
      if(response.threads.length){
        cursor=response.threads[response.threads.length-1]?.thread_metadata?.archive_timestamp??null;
      }
      finished=!response.has_more || !response.threads.length || !cursor;
    }
    await db.query("UPDATE report_import_runs SET phase=$2,cursor=$3,processed=processed+$4,inserted=inserted+$5,status=$6,finished_at=CASE WHEN $6='done' THEN now() ELSE finished_at END,updated_at=now() WHERE id=$1 AND status='running'",
      [id,phase,cursor,processed,inserted,finished?"done":"running"]);
    return finished?"done":"more";
  }catch(e){
    const message=e instanceof Error?e.message:"Unknown import error";
    await db.query("UPDATE report_import_runs SET status='paused',errors=errors+1,last_error=$2,updated_at=now() WHERE id=$1",
      [id,message.slice(0,250)]);
    return "done";
  }
}
