import { AttachmentBuilder, ChannelType, type Client } from "discord.js";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import { audit } from "./audit.js";
import { IDS } from "./ids.js";

type SectionStatus = "ok" | "partial" | "unavailable" | "not_requested";
export type AuditOptions = {
  includeArchived: boolean;
  maxArchivedPerForum: number;
};
export type AuditSnapshot = {
  schemaVersion: 2;
  application: "TFL Studio Core";
  capturedAt: string;
  guildId: string;
  scope: {
    messageBodies: false;
    attachmentData: false;
    memberCensus: false;
    archivedRequested: boolean;
  };
  sections: Record<
    string,
    { status: SectionStatus; count: number | null; error?: string }
  >;
  guild: Record<string, unknown>;
  channels: Array<Record<string, unknown>>;
  roles: Array<Record<string, unknown>>;
  emojis: Array<Record<string, unknown>>;
  stickers: Array<Record<string, unknown>>;
  autoMod: Array<Record<string, unknown>>;
  integrations: Array<Record<string, unknown>>;
  onboarding: Record<string, unknown> | null;
  welcomeScreen: Record<string, unknown> | null;
  activeThreads: Array<Record<string, unknown>>;
  archivedThreads: Array<Record<string, unknown>>;
  totals: Record<string, number | null>;
  completeness: "complete" | "partial";
};
export const defaultAuditOptions: AuditOptions = {
  includeArchived: false,
  maxArchivedPerForum: 100,
};
const status = (
  count: number | null,
  state: SectionStatus = "ok",
  error?: string,
) => {
  return error ? { status: state, count, error } : { status: state, count };
};
async function request<T>(config: Config, path: string): Promise<T> {
  const res = await fetch("https://discord.com/api/v10" + path, {
    headers: { Authorization: "Bot " + config.BOT_TOKEN },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("Discord API " + res.status);
  return res.json() as Promise<T>;
}
function formatMarkdown(snapshot: AuditSnapshot): string {
  const sections = Object.entries(snapshot.sections).map(
    ([key, result]) =>
      "- " +
      key +
      ": " +
      result.status +
      " (" +
      (result.count === null ? "desconocido" : result.count) +
      ")" +
      (result.error ? " — " + result.error : ""),
  );
  return [
    "# TFL STUDIO / INVENTARIO ESTRUCTURAL",
    "**Fecha:** " + snapshot.capturedAt + " · **Esquema:** 2",
    "**Integridad:** " + snapshot.completeness.toUpperCase(),
    "**Ámbito:** estructura, NO cuerpos de mensajes, NO archivos ni censo completo",
    "## ESTADO DE SECCIONES",
    ...sections,
    "## RESUMEN DEL SERVIDOR",
    ...Object.entries(snapshot.guild).map(
      ([k, v]) => "- " + k + ": " + String(v),
    ),
    "## CANALES",
    ...snapshot.channels.map(
      (x) =>
        "- " +
        x.name +
        " · " +
        x.id +
        " · tipo " +
        x.type +
        " · padre " +
        (x.parentId ?? "—"),
    ),
    "## ROLES",
    ...snapshot.roles.map(
      (x) =>
        "- " +
        x.name +
        " · " +
        x.id +
        " · posición " +
        x.position +
        " · permisos " +
        x.permissions,
    ),
    "## HILOS ACTIVOS",
    ...snapshot.activeThreads.map(
      (x) => "- " + x.name + " · " + x.id + " · padre " + x.parentId,
    ),
    "## HILOS ARCHIVADOS",
    ...snapshot.archivedThreads.map((x) => "- " + x.name + " · " + x.id),
    "## REGLAS AUTOMOD",
    ...snapshot.autoMod.map(
      (x) => "- " + x.name + " · " + x.id + " · activo " + x.enabled,
    ),
    "## INTEGRACIONES",
    ...snapshot.integrations.map((x) => "- " + x.name + " · " + x.type),
    "## ADVERTENCIAS",
    "Una sección parcial o no disponible NO representa cero elementos.",
  ].join("\n");
}
export async function captureStructure(
  client: Client,
  config: Config,
  options: AuditOptions = defaultAuditOptions,
): Promise<{ data: AuditSnapshot; markdown: string }> {
  const guild = client.guilds.cache.get(IDS.guild);
  if (!guild || guild.id !== config.DISCORD_GUILD_ID)
    throw new Error("TFL Studio Guild unavailable");
  const sections: AuditSnapshot["sections"] = {};
  const [channels, roles] = await Promise.all([
    guild.channels.fetch(),
    guild.roles.fetch(),
  ]);
  const structuralChannels = channels
    .filter((c) => c !== null)
    .map((c) => {
      const channel = c!;
      const tags =
        channel.type === ChannelType.GuildForum ||
        channel.type === ChannelType.GuildMedia
          ? channel.availableTags.map((tag) => ({
              id: tag.id,
              name: tag.name,
              moderated: tag.moderated,
            }))
          : [];
      return {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId,
        position: "rawPosition" in channel ? channel.rawPosition : null,
        permissionLocked:
          "permissionsLocked" in channel ? channel.permissionsLocked : null,
        overwrites: channel.permissionOverwrites.cache.map((o) => ({
          id: o.id,
          type: o.type,
          allow: o.allow.bitfield.toString(),
          deny: o.deny.bitfield.toString(),
        })),
        tags,
        settings: {
          topic: "topic" in channel ? channel.topic : null,
          nsfw: "nsfw" in channel ? channel.nsfw : null,
          rateLimitPerUser:
            "rateLimitPerUser" in channel ? channel.rateLimitPerUser : null,
          defaultAutoArchiveDuration:
            "defaultAutoArchiveDuration" in channel
              ? channel.defaultAutoArchiveDuration
              : null,
          bitrate: "bitrate" in channel ? channel.bitrate : null,
          userLimit: "userLimit" in channel ? channel.userLimit : null,
        },
      };
    });
  const structuralRoles = roles.map((role) => ({
    id: role.id,
    name: role.name,
    position: role.position,
    color: role.hexColor,
    hoist: role.hoist,
    managed: role.managed,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
  }));
  sections.channels = status(structuralChannels.length);
  sections.roles = status(structuralRoles.length);
  const guildDetails = {
    id: guild.id,
    name: guild.name,
    createdAt: guild.createdAt.toISOString(),
    ownerId: guild.ownerId,
    features: guild.features,
    verificationLevel: guild.verificationLevel,
    explicitContentFilter: guild.explicitContentFilter,
    mfaLevel: guild.mfaLevel,
    preferredLocale: guild.preferredLocale,
    premiumTier: guild.premiumTier,
    premiumSubscriptionCount: guild.premiumSubscriptionCount,
    memberCountEstimate: guild.memberCount,
    memberCountVerified: null,
    rulesChannelId: guild.rulesChannelId,
    systemChannelId: guild.systemChannelId,
    afkChannelId: guild.afkChannelId,
  };
  sections.guild = status(1);
  const emojis: Array<Record<string, unknown>> = [];
  const stickers: Array<Record<string, unknown>> = [];
  const autoMod: Array<Record<string, unknown>> = [];
  const integrations: Array<Record<string, unknown>> = [];
  let onboarding: Record<string, unknown> | null = null;
  let welcomeScreen: Record<string, unknown> | null = null;
  const activeThreads: Array<Record<string, unknown>> = [];
  const archivedThreads: Array<Record<string, unknown>> = [];
  const optional = async (name: string, fn: () => Promise<number>) => {
    try {
      const count = await fn();
      if (!sections[name] || sections[name].status === "ok")
        sections[name] = status(count);
    } catch (e) {
      sections[name] = status(
        null,
        "unavailable",
        e instanceof Error ? e.message.slice(0, 100) : "unknown",
      );
    }
  };
  await optional("emojis", async () => {
    const collection = await guild.emojis.fetch();
    for (const e of collection.values())
      emojis.push({
        id: e.id,
        name: e.name,
        animated: e.animated,
        available: e.available,
      });
    return emojis.length;
  });
  await optional("stickers", async () => {
    const collection = await guild.stickers.fetch();
    for (const s of collection.values())
      stickers.push({ id: s.id, name: s.name, format: s.format, type: s.type });
    return stickers.length;
  });
  await optional("automod", async () => {
    const rules = await request<
      Array<{
        id: string;
        name: string;
        enabled: boolean;
        trigger_type: number;
        actions: Array<{ type: number }>;
      }>
    >(config, "/guilds/" + guild.id + "/auto-moderation/rules");
    for (const rule of rules)
      autoMod.push({
        id: rule.id,
        name: rule.name,
        enabled: rule.enabled,
        triggerType: rule.trigger_type,
        actionTypes: rule.actions.map((a) => a.type),
      });
    return autoMod.length;
  });
  await optional("integrations", async () => {
    const all = await request<
      Array<{ id: string; name: string; type: string; enabled: boolean }>
    >(config, "/guilds/" + guild.id + "/integrations");
    for (const item of all)
      integrations.push({
        id: item.id,
        name: item.name,
        type: item.type,
        enabled: item.enabled,
      });
    return integrations.length;
  });
  await optional("onboarding", async () => {
    const value = await request<{
      enabled: boolean;
      mode: number;
      prompts?: Array<{
        id: string;
        title: string;
        required: boolean;
        options: Array<{
          id: string;
          title: string;
          role_ids: string[];
          channel_ids: string[];
        }>;
      }>;
    }>(config, "/guilds/" + guild.id + "/onboarding");
    onboarding = {
      enabled: value.enabled,
      mode: value.mode,
      prompts: (value.prompts ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        required: p.required,
        options: p.options.map((o) => ({
          id: o.id,
          title: o.title,
          roleIds: o.role_ids,
          channelIds: o.channel_ids,
        })),
      })),
    };
    return value.prompts?.length ?? 0;
  });
  await optional("welcomeScreen", async () => {
    const value = await request<{
      description: string | null;
      welcome_channels: Array<{ channel_id: string; description: string }>;
    }>(config, "/guilds/" + guild.id + "/welcome-screen");
    welcomeScreen = {
      description: value.description,
      channels: value.welcome_channels.map((c) => ({
        id: c.channel_id,
        description: c.description,
      })),
    };
    return value.welcome_channels.length;
  });
  await optional("activeThreads", async () => {
    const response = await request<{
      threads: Array<{
        id: string;
        name: string;
        parent_id: string;
        archived?: boolean;
        applied_tags?: string[];
      }>;
    }>(config, "/guilds/" + guild.id + "/threads/active");
    for (const thread of response.threads)
      activeThreads.push({
        id: thread.id,
        name: thread.name,
        parentId: thread.parent_id,
        archived: thread.archived ?? false,
        tags: thread.applied_tags ?? [],
      });
    return activeThreads.length;
  });
  if (options.includeArchived) {
    await optional("archivedThreads", async () => {
      let truncated = false;
      for (const c of structuralChannels.filter(
        (c) =>
          c.type === ChannelType.GuildForum ||
          c.type === ChannelType.GuildMedia,
      )) {
        let before: string | null = null;
        let count = 0,
          more = true;
        while (more && count < options.maxArchivedPerForum) {
          const args = new URLSearchParams({
            limit: String(Math.min(100, options.maxArchivedPerForum - count)),
          });
          if (before) args.set("before", before);
          const result = await request<{
            threads: Array<{
              id: string;
              name: string;
              parent_id: string;
              thread_metadata?: { archive_timestamp?: string };
            }>;
            has_more: boolean;
          }>(config, "/channels/" + c.id + "/threads/archived/public?" + args);
          for (const thread of result.threads)
            archivedThreads.push({
              id: thread.id,
              name: thread.name,
              parentId: thread.parent_id,
              archivedAt: thread.thread_metadata?.archive_timestamp ?? null,
            });
          count += result.threads.length;
          before =
            result.threads.at(-1)?.thread_metadata?.archive_timestamp ?? null;
          more =
            result.has_more && result.threads.length > 0 && before !== null;
          if (
            result.has_more &&
            (!more || count >= options.maxArchivedPerForum)
          )
            truncated = true;
        }
      }
      if (truncated) {
        sections.archivedThreads = status(
          archivedThreads.length,
          "partial",
          "Archive scan reached configured limit",
        );
      }
      return archivedThreads.length;
    });
  } else sections.archivedThreads = status(null, "not_requested");
  sections.members = status(
    null,
    "unavailable",
    "Exact member-by-role census not requested or verified",
  );
  sections.activity = status(null, "not_requested");
  const incomplete = Object.values(sections).some((s) => s.status !== "ok");
  const data: AuditSnapshot = {
    schemaVersion: 2,
    application: "TFL Studio Core",
    capturedAt: new Date().toISOString(),
    guildId: guild.id,
    scope: {
      messageBodies: false,
      attachmentData: false,
      memberCensus: false,
      archivedRequested: options.includeArchived,
    },
    sections,
    guild: guildDetails,
    channels: structuralChannels,
    roles: structuralRoles,
    emojis,
    stickers,
    autoMod,
    integrations,
    onboarding,
    welcomeScreen,
    activeThreads,
    archivedThreads,
    totals: {
      categories: structuralChannels.filter(
        (c) => c.type === ChannelType.GuildCategory,
      ).length,
      channelObjects: structuralChannels.length,
      roles: structuralRoles.length,
      activeThreads: sections.activeThreads?.count ?? null,
      archivedThreads: sections.archivedThreads?.count ?? null,
      memberCountVerified: null,
    },
    completeness: incomplete ? "partial" : "complete",
  };
  return { data, markdown: formatMarkdown(data) };
}
export function compareSnapshots(
  a: AuditSnapshot,
  b: AuditSnapshot,
): Record<string, unknown> {
  const diff = (key: "channels" | "roles") => {
    const left = new Map(
      a[key].map((entry) => [String(entry.id), JSON.stringify(entry)]),
    );
    const right = new Map(
      b[key].map((entry) => [String(entry.id), JSON.stringify(entry)]),
    );
    return {
      added: [...right.keys()].filter((id) => !left.has(id)),
      removed: [...left.keys()].filter((id) => !right.has(id)),
      modified: [...right.keys()].filter(
        (id) => left.has(id) && left.get(id) !== right.get(id),
      ),
    };
  };
  return {
    from: a.capturedAt,
    to: b.capturedAt,
    channels: diff("channels"),
    roles: diff("roles"),
    limitations:
      "Only observed structural changes; incomplete sections are not interpreted as deletions",
  };
}
export async function collectStructure(
  client: Client,
  db: DB,
  actorId: string,
  config: Config,
  options: AuditOptions = defaultAuditOptions,
): Promise<{
  json: AttachmentBuilder;
  markdown: AttachmentBuilder;
  data: AuditSnapshot;
  markdownText: string;
}> {
  const output = await captureStructure(client, config, options);
  const json = Buffer.from(JSON.stringify(output.data, null, 2), "utf8");
  const md = Buffer.from(output.markdown, "utf8");
  if (json.length > 8 * 1024 * 1024 || md.length > 8 * 1024 * 1024)
    throw new Error(
      "Export exceeds safe Discord attachment size; use the restricted API",
    );
  await audit(db, "auditor.collect", actorId, "guild", IDS.guild, {
    completeness: output.data.completeness,
    channels: output.data.channels.length,
    roles: output.data.roles.length,
  });
  return {
    json: new AttachmentBuilder(json, { name: "tfl-studio-inventario.json" }),
    markdown: new AttachmentBuilder(md, { name: "tfl-studio-inventario.md" }),
    data: output.data,
    markdownText: output.markdown,
  };
}
