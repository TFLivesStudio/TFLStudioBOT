import { EmbedBuilder, type Client, ChannelType } from "discord.js";
import { IDS } from "./ids.js";

import { visualSchema, type VisualPayload } from "@tfl/shared";
export { visualSchema, embedSchema } from "@tfl/shared";
export function validateDiscordAnnouncement(
  title: string,
  body: string,
  payload: unknown,
  reference = "",
): {
  content: string;
  visual: VisualPayload;
} {
  const visual = visualSchema.parse(payload);
  const content =
    "**" +
    title.replaceAll("@", "@\u200b") +
    "**\n" +
    body.replaceAll("@", "@\u200b") +
    (reference ? "\n\nRef: " + reference : "");
  if (content.length > 2000)
    throw new Error("Discord message content exceeds 2000 characters");
  return { content, visual };
}
/** No arbitrary channel sends; announcements only to the audited announcements channel. */
export async function postAnnouncement(
  client: Client,
  channelId: string,
  title: string,
  body: string,
  payload: unknown,
  reference = "",
): Promise<string> {
  if (channelId !== IDS.channels.anuncios)
    throw new Error("Announcement destination not authorized");
  const { content, visual } = validateDiscordAnnouncement(
    title,
    body,
    payload,
    reference,
  );
  const channel = await client.channels.fetch(channelId);
  if (
    !channel ||
    (channel.type !== ChannelType.GuildText &&
      channel.type !== ChannelType.GuildAnnouncement)
  )
    throw new Error("Target must be an approved text or announcements channel");
  const embeds = visual.embeds.map((e) => {
    const embed = new EmbedBuilder().setColor(e.color);
    if (e.title) embed.setTitle(e.title);
    if (e.description) embed.setDescription(e.description);
    if (e.url) embed.setURL(e.url);
    if (e.image) embed.setImage(e.image);
    if (e.thumbnail) embed.setThumbnail(e.thumbnail);
    if (e.author)
      embed.setAuthor({
        name: e.author.name,
        ...(e.author.url ? { url: e.author.url } : {}),
        ...(e.author.iconUrl ? { iconURL: e.author.iconUrl } : {}),
      });
    if (e.footer) embed.setFooter({ text: e.footer });
    if (e.fields.length) embed.addFields(...e.fields);
    return embed;
  });
  const result = await channel.send({
    content,
    embeds,
    allowedMentions: { parse: [] },
  });
  return result.id;
}
