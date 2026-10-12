import { z } from "zod";
import { EmbedBuilder, type Client, ChannelType } from "discord.js";

export const embedSchema=z.object({
  title:z.string().min(1).max(256).optional(),
  description:z.string().min(1).max(4096).optional(),
  color:z.number().int().min(0).max(0xffffff).default(0x3869a5),
  footer:z.string().max(2048).optional(),
  fields:z.array(z.object({name:z.string().min(1).max(256),value:z.string().min(1).max(1024),inline:z.boolean().default(false)})).max(10).default([])
}).refine(e=>!!e.title||!!e.description,{message:"Embed needs a title or description"});
export const visualSchema=z.object({embeds:z.array(embedSchema).max(3).default([])});
export type VisualPayload=z.infer<typeof visualSchema>;
export async function postAnnouncement(client:Client,channelId:string,title:string,body:string,payload:unknown):Promise<string>{
  const visual=visualSchema.parse(payload);
  if(visual.embeds.reduce((n,e)=>n+(e.title?.length??0)+(e.description?.length??0)+(e.footer?.length??0)+e.fields.reduce((x,f)=>x+f.name.length+f.value.length,0),0)>5800) throw new Error("Discord embed total size exceeded");
  const channel=await client.channels.fetch(channelId);
  if(!channel || (channel.type!==ChannelType.GuildText && channel.type!==ChannelType.GuildAnnouncement)) throw new Error("Target must be an announcement/text channel");
  const embeds=visual.embeds.map(e=>{
    const embed=new EmbedBuilder().setColor(e.color);
    if(e.title)embed.setTitle(e.title);
    if(e.description)embed.setDescription(e.description);
    if(e.footer)embed.setFooter({text:e.footer});
    if(e.fields.length)embed.addFields(...e.fields);
    return embed;
  });
  const result=await channel.send({
    content:"**"+title.replaceAll("@","@\u200b")+"**\n"+body.replaceAll("@","@\u200b"),
    embeds,
    allowedMentions:{parse:[]}
  });
  return result.id;
}
