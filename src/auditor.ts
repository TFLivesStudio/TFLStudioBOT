import { AttachmentBuilder, type Client } from "discord.js";
import type { DB } from "./db.js";
import { audit } from "./audit.js";
export async function collectStructure(client:Client,db:DB,actorId:string):Promise<{json:AttachmentBuilder;markdown:AttachmentBuilder}>{
  const guild=client.guilds.cache.get("1264656310205415474");
  if(!guild) throw new Error("TFL Studio guild is not connected");
  const [channels,roles]=await Promise.all([guild.channels.fetch(),guild.roles.fetch()]);
  const stamp=new Date().toISOString();
  const payload={
    schemaVersion:1,source:"TFL Studio Core",capturedAt:stamp,guildId:guild.id,
    partial:true,includesMessageBodies:false,
    limits:["No member census","No message bodies","No archived threads","No historical audit backfill"],
    guild:{name:guild.name,memberCountEstimate:guild.memberCount},
    channels:channels.filter(c=>c!==null).map(c=>({
      id:c!.id,name:c!.name,type:c!.type,parentId:c!.parentId,
      overwrites:c!.permissionOverwrites.cache.map(o=>({id:o.id,type:o.type,allow:o.allow.bitfield.toString(),deny:o.deny.bitfield.toString()}))
    })),
    roles:roles.map(r=>({id:r.id,name:r.name,position:r.position,permissions:r.permissions.bitfield.toString()}))
  };
  const md=[
    "# TFL STUDIO / INVENTARIO",
    "Fecha: "+stamp,"Guild: "+guild.id,
    "Estado: PARCIAL (sin cuerpos de mensajes, sin miembros ni hilos archivados)",
    "## Canales",...payload.channels.map(c=>"- "+c.name+" / "+c.id+" / parent "+(c.parentId??"—")),
    "## Roles",...payload.roles.map(r=>"- "+r.name+" / "+r.id)
  ].join("\n");
  await audit(db,"auditor.collect",actorId,"guild",guild.id,{channels:payload.channels.length,roles:payload.roles.length,partial:true});
  return {
    json:new AttachmentBuilder(Buffer.from(JSON.stringify(payload,null,2),"utf8"),{name:"tfl-studio-inventario.json"}),
    markdown:new AttachmentBuilder(Buffer.from(md,"utf8"),{name:"tfl-studio-inventario.md"})
  };
}
