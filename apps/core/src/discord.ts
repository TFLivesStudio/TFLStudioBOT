import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
} from "discord.js";
import type { Config } from "./config.js";
import type { DB } from "./db.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { createReport } from "./reports.js";
import { collectStructure } from "./auditor.js";
import { canUseChannel } from "./permissions.js";
import { attachReportEvents } from "./report-index.js";
export function buildDiscord(config: Config, db: DB): Client {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      ...(config.INDEX_MESSAGE_CONTENT_INTENT
        ? [GatewayIntentBits.MessageContent]
        : []),
    ],
  });
  client.on("error", (error) => console.error("discord_client_error", error));
  attachReportEvents(client, db, config);
  client.on("interactionCreate", async (interaction) => {
    if (
      !interaction.isChatInputCommand() ||
      interaction.guildId !== config.DISCORD_GUILD_ID
    )
      return;
    try {
      if (interaction.commandName === "inicio") {
        const member = await interaction.guild?.members.fetch({
          user: interaction.user.id,
          force: true,
        });
        if (!member || member.pending) {
          await interaction.reply({
            content:
              "Tu incorporación aún requiere completar la aprobación humana en Discord.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await interaction.reply({
          content:
            "**TFL STUDIO / BIENVENIDA**\nConsulta <#1559241799271194625> para conocer las normas y <#1525142989494812793> para encontrar las guías internas. El acceso a las áreas depende de los roles autorizados por ADMIN.",
          flags: MessageFlags.Ephemeral,
          allowedMentions: { parse: [] },
        });
        return;
      }
      if (interaction.commandName === "recopilar") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const member = await interaction.guild?.members.fetch({
          user: interaction.user.id,
          force: true,
        });
        if (
          !member ||
          member.pending ||
          !member.roles.cache.has(config.ADMIN_ROLE_ID)
        ) {
          await interaction.editReply("Sin autorización.");
          return;
        }
        const files = await collectStructure(
          client,
          db,
          interaction.user.id,
          config,
        );
        await interaction.editReply({
          content:
            "Inventario estructural parcial, sin mensajes privados ni credenciales.",
          files: [files.json, files.markdown],
        });
        return;
      }
      if (interaction.commandName === "estado-bot") {
        const member = await interaction.guild?.members.fetch({
          user: interaction.user.id,
          force: true,
        });
        const admin =
          member &&
          !member.pending &&
          member.roles.cache.has(config.ADMIN_ROLE_ID);
        await interaction.reply({
          content: admin
            ? "TFL STUDIO / Core en línea. Usa el dashboard para diagnósticos avanzados."
            : "Sin autorización.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (interaction.commandName === "reporte") {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const key = interaction.options.getString(
          "departamento",
          true,
        ) as DepartmentKey;
        const target = DEPARTMENTS[key];
        if (!target) {
          await interaction.editReply("Departamento desconocido.");
          return;
        }
        const member = await interaction.guild?.members.fetch({
          user: interaction.user.id,
          force: true,
        });
        const allowed =
          !!member &&
          !member.pending &&
          (await canUseChannel(
            config,
            {
              userId: interaction.user.id,
              roles: [...member.roles.cache.keys()],
              csrfHash: "",
            },
            key,
            "write",
          ));
        if (!allowed) {
          await interaction.editReply(
            "No tienes autorización para publicar en este departamento.",
          );
          return;
        }
        const title = interaction.options.getString("titulo", true);
        const description = interaction.options.getString("descripcion", true);
        const record = await createReport(
          db,
          client,
          key,
          title,
          description,
          interaction.user.id,
          "discord:" + interaction.id,
          [],
          interaction.options.getString("proyecto"),
        );
        await interaction.editReply(
          record.url
            ? "Reporte publicado: " + record.url
            : "Reporte ST-" +
                record.id +
                " registrado. Publicación en cola; puedes consultar su estado desde la API.",
        );
      }
    } catch (e) {
      console.error("interaction_failed", e);
      if (interaction.deferred || interaction.replied)
        await interaction
          .editReply(
            "No se pudo completar la operación. Revisa el registro de errores.",
          )
          .catch(() => undefined);
      else
        await interaction
          .reply({ content: "Error interno.", flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
    }
  });
  return client;
}
export function commandDefinitions() {
  const choices = Object.keys(DEPARTMENTS).map((k) => ({ name: k, value: k }));
  const commands = [
    new SlashCommandBuilder()
      .setName("estado-bot")
      .setDescription("Diagnóstico básico de TFL Studio Core"),
    new SlashCommandBuilder()
      .setName("recopilar")
      .setDescription("Exporta el inventario estructural (ADMIN)"),
    new SlashCommandBuilder()
      .setName("inicio")
      .setDescription("Orientación de bienvenida tras la aprobación humana"),
    new SlashCommandBuilder()
      .setName("reporte")
      .setDescription("Publica un registro operativo en tu departamento")
      .addStringOption((o) =>
        o
          .setName("departamento")
          .setDescription("Departamento destino")
          .setRequired(true)
          .addChoices(...choices),
      )
      .addStringOption((o) =>
        o
          .setName("titulo")
          .setDescription("Título del reporte")
          .setMinLength(3)
          .setMaxLength(100)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("descripcion")
          .setDescription("Descripción")
          .setMinLength(3)
          .setMaxLength(1500)
          .setRequired(true),
      )
      .addStringOption((o) =>
        o
          .setName("proyecto")
          .setDescription("Proyecto (opcional)")
          .setMaxLength(80),
      ),
  ];
  return commands.map((command) => command.toJSON());
}
export async function registerCommands(
  config: Config,
  rest: Pick<REST, "put"> = new REST({ version: "10" }).setToken(
    config.BOT_TOKEN,
  ),
): Promise<void> {
  await rest.put(
    Routes.applicationGuildCommands(
      config.DISCORD_CLIENT_ID,
      config.DISCORD_GUILD_ID,
    ),
    { body: commandDefinitions() },
  );
}
export async function postToDestination(
  client: Client,
  channelId: string,
  title: string,
  description: string,
  tagIds: string[] = [],
  reference = "",
): Promise<{ messageId: string; threadId: string | null; url: string }> {
  const channel = await client.channels.fetch(channelId);
  const text = (
    "**" +
    title.replaceAll("@", "@\u200b").slice(0, 100) +
    "**\n" +
    description.replaceAll("@", "@\u200b").slice(0, 1750) +
    (reference ? "\n\nRef: " + reference : "")
  ).slice(0, 1990);
  if (!channel) throw new Error("Destination channel not found: " + channelId);
  if (channel.type === ChannelType.GuildForum) {
    const available = new Set(channel.availableTags.map((tag) => tag.id));
    const selected = tagIds.filter((id) => available.has(id));
    if (channel.flags.has("RequireTag") && selected.length === 0)
      throw new Error("Required forum tag is missing");
    const thread = await channel.threads.create({
      name: title.slice(0, 100),
      message: { content: text, allowedMentions: { parse: [] } },
      appliedTags: selected,
    });
    const msg = await thread.fetchStarterMessage();
    if (!msg) throw new Error("Forum starter message unavailable");
    return { messageId: msg.id, threadId: thread.id, url: msg.url };
  }
  if (!("send" in channel) || typeof channel.send !== "function")
    throw new Error("Destination is not writable text");
  const msg = await channel.send({
    content: text,
    allowedMentions: { parse: [] },
  });
  return { messageId: msg.id, threadId: null, url: msg.url };
}
