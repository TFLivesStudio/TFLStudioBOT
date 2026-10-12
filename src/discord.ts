import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType } from "discord.js";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { createReport } from "./reports.js";
import { collectStructure } from "./auditor.js";
export function buildDiscord(config: Config, db: DB): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on("error", error => console.error("discord_client_error", error));
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.guildId !== config.DISCORD_GUILD_ID) return;
    try {
      if (interaction.commandName === "recopilar") {
        await interaction.deferReply({ephemeral:true});
        const member=await interaction.guild?.members.fetch(interaction.user.id);
        if (!member?.roles.cache.has(config.ADMIN_ROLE_ID)) {await interaction.editReply("Sin autorización.");return;}
        const files=await collectStructure(client,db,interaction.user.id);
        await interaction.editReply({content:"Inventario estructural parcial, sin mensajes privados ni credenciales.",files:[files.json,files.markdown]});
        return;
      }
      if (interaction.commandName === "estado-bot") {
        const member=await interaction.guild?.members.fetch(interaction.user.id);
        const admin=member?.roles.cache.has(config.ADMIN_ROLE_ID);
        await interaction.reply({ content: admin ? "TFL STUDIO / Core en línea. Usa el dashboard para diagnósticos avanzados." : "Sin autorización.", ephemeral: true });
        return;
      }
      if (interaction.commandName === "reporte") {
        await interaction.deferReply({ ephemeral: true });
        const key = interaction.options.getString("departamento", true) as DepartmentKey;
        const target = DEPARTMENTS[key];
        if (!target) { await interaction.editReply("Departamento desconocido."); return; }
        const member=await interaction.guild?.members.fetch(interaction.user.id);
        const allowed = member && !member.pending && (member.roles.cache.has(config.ADMIN_ROLE_ID) || member.roles.cache.has(target.role)) && member.permissionsIn(target.destination).has("ViewChannel") && member.permissionsIn(target.destination).has(target.kind==="forum"?"CreatePublicThreads":"SendMessages");
        if (!allowed) { await interaction.editReply("No tienes autorización para publicar en este departamento."); return; }
        const title = interaction.options.getString("titulo", true);
        const description = interaction.options.getString("descripcion", true);
        const record = await createReport(db, client, key, title, description, interaction.user.id, "discord:" + interaction.id);
        await interaction.editReply("Reporte registrado: " + record.url);
      }
    } catch (e) {
      console.error("interaction_failed", e);
      if (interaction.deferred || interaction.replied) await interaction.editReply("No se pudo completar la operación. Revisa el registro de errores.").catch(() => undefined);
      else await interaction.reply({ content: "Error interno.", ephemeral: true }).catch(() => undefined);
    }
  });
  return client;
}
export async function registerCommands(config: Config): Promise<void> {
  const choices = Object.keys(DEPARTMENTS).map(k => ({ name: k, value: k }));
  const commands = [
    new SlashCommandBuilder().setName("estado-bot").setDescription("Diagnóstico básico de TFL Studio Core"),
    new SlashCommandBuilder().setName("recopilar").setDescription("Exporta el inventario estructural (ADMIN)"),
    new SlashCommandBuilder().setName("reporte").setDescription("Publica un registro operativo en tu departamento")
      .addStringOption(o => o.setName("departamento").setDescription("Departamento destino").setRequired(true).addChoices(...choices))
      .addStringOption(o => o.setName("titulo").setDescription("Título del reporte").setMinLength(3).setMaxLength(100).setRequired(true))
      .addStringOption(o => o.setName("descripcion").setDescription("Descripción").setMinLength(3).setMaxLength(1500).setRequired(true))
  ];
  const rest = new REST({ version: "10" }).setToken(config.BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID), { body: commands.map(x => x.toJSON()) });
}
export async function postToDestination(client: Client, channelId: string, title: string, description: string, tagIds: string[] = []): Promise<{messageId: string; threadId: string | null; url: string}> {
  const channel = await client.channels.fetch(channelId);
  const text = "**" + title.replaceAll("@", "@\u200b").slice(0, 100) + "**\n" + description.replaceAll("@", "@\u200b").slice(0, 1800);
  if (!channel) throw new Error("Destination channel not found: " + channelId);
  if (channel.type === ChannelType.GuildForum) {
    const available = new Set(channel.availableTags.map(tag => tag.id));
    const selected = tagIds.filter(id => available.has(id));
    if (channel.flags.has("RequireTag") && selected.length === 0) throw new Error("Required forum tag is missing");
    const thread = await channel.threads.create({ name: title.slice(0, 100), message: { content: text, allowedMentions: { parse: [] } }, appliedTags: selected });
    const msg = await thread.fetchStarterMessage();
    if (!msg) throw new Error("Forum starter message unavailable");
    return { messageId: msg.id, threadId: thread.id, url: msg.url };
  }
  if (!("send" in channel) || typeof channel.send !== "function") throw new Error("Destination is not writable text");
  const msg = await channel.send({ content: text, allowedMentions: { parse: [] } });
  return { messageId: msg.id, threadId: null, url: msg.url };
}
