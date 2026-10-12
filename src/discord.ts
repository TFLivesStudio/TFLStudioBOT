import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, ChannelType, PermissionFlagsBits } from "discord.js";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { IDS, DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { createReport } from "./reports.js";
export function buildDiscord(config: Config, db: DB): Client {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.on("error", error => console.error("discord_client_error", error));
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand() || interaction.guildId !== config.DISCORD_GUILD_ID) return;
    try {
      if (interaction.commandName === "estado-bot") {
        const admin = interaction.member && "roles" in interaction.member && Array.isArray(interaction.member.roles) && interaction.member.roles.includes(config.ADMIN_ROLE_ID);
        await interaction.reply({ content: admin ? "TFL STUDIO / Core en línea. Usa el dashboard para diagnósticos avanzados." : "Sin autorización.", ephemeral: true });
        return;
      }
      if (interaction.commandName === "reporte") {
        await interaction.deferReply({ ephemeral: true });
        const key = interaction.options.getString("departamento", true) as DepartmentKey;
        const target = DEPARTMENTS[key];
        if (!target) { await interaction.editReply("Departamento desconocido."); return; }
        const roles = interaction.member && "roles" in interaction.member ? interaction.member.roles : [];
        const allowed = Array.isArray(roles) && (roles.includes(config.ADMIN_ROLE_ID) || roles.includes(target.role));
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
