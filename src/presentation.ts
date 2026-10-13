import { z } from "zod";
import { EmbedBuilder, type Client, ChannelType } from "discord.js";
import { IDS } from "./ids.js";

const httpsUrl=z.string().url().max(1800).refine(v=>v.startsWith("https://"),"Only HTTPS images/URLs are allowed");
const field=z.object({
  name:z.string().trim().min(1).max(256),
  value:z.string().trim().min(1).max(1024),
  inline:z.boolean().default(false)
});
export const embedSchema=z.object({
  title:z.string().trim().min(1).max(256).optional(),
  description:z.string().trim().min(1).max(4096).optional(),
  url:httpsUrl.optional(),
  image:httpsUrl.optional(),
  thumbnail:httpsUrl.optional(),
  author:z.object({name:z.string().min(1).max(256),url:httpsUrl.optional(),iconUrl:httpsUrl.optional()}).optional(),
  color:z.number().int().min(0).max(0xffffff).default(0x3869a5),
  footer:z.string().max(2048).optional(),
  fields:z.array(field).max(25).default([])
}).refine(e=>!!e.title||!!e.description||!!e.image,{message:"Embed needs a title, description or image"});
export const visualSchema=z.object({embeds:z.array(embedSchema).max(10).default([])}).superRefine((visual,ctx)=>{
  const n=visual.embeds.reduce((sum,e)=>sum+
    (e.title?.length??0)+(e.description?.length??0)+(e.footer?.length??0)+(e.author?.name.length??0)+
    e.fields.reduce((total,f)=>total+f.name.length+f.value.length,0),0);
  if(n>6000)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Combined embed text exceeds Discord's 6000-character limit"});
});
export type VisualPayload=z.infer<typeof visualSchema>;
export function validateDiscordAnnouncement(title:string,body:string,payload:unknown,reference=""): {
  content:string; visual:VisualPayload
}{
  const visual=visualSchema.parse(payload);
  const content="**"+title.replaceAll("@","@\u200b")+"**\n"+
    body.replaceAll("@","@\u200b")+(reference?"\n\nRef: "+reference:"");
  if(content.length>2000)throw new Error("Discord message content exceeds 2000 characters");
  return {content,visual};
}
/** No arbitrary channel sends; announcements only to the audited announcements channel. */
export async function postAnnouncement(client:Client,channelId:string,title:string,body:string,payload:unknown,reference=""):Promise<string>{
  if(channelId!==IDS.channels.anuncios)throw new Error("Announcement destination not authorized");
  const {content,visual}=validateDiscordAnnouncement(title,body,payload,reference);
  const channel=await client.channels.fetch(channelId);
  if(!channel || (channel.type!==ChannelType.GuildText && channel.type!==ChannelType.GuildAnnouncement))
    throw new Error("Target must be an approved text or announcements channel");
  const embeds=visual.embeds.map(e=>{
    const embed=new EmbedBuilder().setColor(e.color);
    if(e.title)embed.setTitle(e.title);
    if(e.description)embed.setDescription(e.description);
    if(e.url)embed.setURL(e.url);
    if(e.image)embed.setImage(e.image);
    if(e.thumbnail)embed.setThumbnail(e.thumbnail);
    if(e.author)embed.setAuthor({name:e.author.name,...(e.author.url?{url:e.author.url}:{}),...(e.author.iconUrl?{iconURL:e.author.iconUrl}:{})});
    if(e.footer)embed.setFooter({text:e.footer});
    if(e.fields.length)embed.addFields(...e.fields);
    return embed;
  });
  const result=await channel.send({content,embeds,allowedMentions:{parse:[]}});
  return result.id;
}
