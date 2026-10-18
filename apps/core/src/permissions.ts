import type { Config } from "./config.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import type { Identity } from "./auth.js";

export type ChannelAction = "read" | "write" | "reply";
const bit = {
  administrator: 1n << 3n,
  view: 1n << 10n,
  send: 1n << 11n,
  sendInThreads: 1n << 38n,
};
type Role = { id: string; permissions: string };
type Overwrite = { id: string; type: number; allow: string; deny: string };
type Channel = {
  id: string;
  type: number;
  parent_id?: string | null;
  permission_overwrites?: Overwrite[];
};
export type AuthorizationSnapshot = { roles: Role[]; channel: Channel };

async function discordGet<T>(config: Config, path: string): Promise<T> {
  const res = await fetch("https://discord.com/api/v10" + path, {
    headers: { Authorization: "Bot " + config.BOT_TOKEN },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok)
    throw Object.assign(new Error("Discord permission lookup unavailable"), {
      statusCode: 503,
    });
  return res.json() as Promise<T>;
}
function overwrite(flags: bigint, deny: bigint, allow: bigint): bigint {
  return (flags & ~deny) | allow;
}
/** Shared policy used by both slash commands and HTTP API; never trusts client-provided role IDs. */
export function evaluateChannel(
  config: Config,
  actor: Identity,
  department: DepartmentKey,
  action: ChannelAction,
  snapshot: AuthorizationSnapshot,
): boolean {
  const expectedRole = DEPARTMENTS[department].role;
  if (
    !actor.roles.includes(config.ADMIN_ROLE_ID) &&
    !actor.roles.includes(expectedRole)
  )
    return false;
  const all = snapshot.roles;
  const everyone = all.find((r) => r.id === config.DISCORD_GUILD_ID);
  if (!everyone) return false;
  let effective = BigInt(everyone.permissions);
  for (const role of all)
    if (actor.roles.includes(role.id)) effective |= BigInt(role.permissions);
  if (effective & bit.administrator) return true;

  const overrides = snapshot.channel.permission_overwrites ?? [];
  const base = overrides.find((o) => o.id === config.DISCORD_GUILD_ID);
  if (base)
    effective = overwrite(effective, BigInt(base.deny), BigInt(base.allow));
  let allow = 0n;
  let deny = 0n;
  for (const entry of overrides) {
    if (entry.type === 0 && actor.roles.includes(entry.id)) {
      allow |= BigInt(entry.allow);
      deny |= BigInt(entry.deny);
    }
  }
  effective = overwrite(effective, deny, allow);
  const member = overrides.find((o) => o.type === 1 && o.id === actor.userId);
  if (member)
    effective = overwrite(effective, BigInt(member.deny), BigInt(member.allow));

  // GuildForum (15) and GuildMedia (16) require SendMessages for new posts.
  // Existing thread replies require SendMessagesInThreads instead.
  const required =
    bit.view |
    (action === "reply"
      ? bit.sendInThreads
      : action === "write"
        ? bit.send
        : 0n);
  return (effective & required) === required;
}
export async function canUseChannel(
  config: Config,
  actor: Identity,
  department: DepartmentKey,
  action: ChannelAction,
): Promise<boolean> {
  if (
    !actor.roles.includes(config.ADMIN_ROLE_ID) &&
    !actor.roles.includes(DEPARTMENTS[department].role)
  )
    return false;
  const [roles, channel] = await Promise.all([
    discordGet<Role[]>(config, "/guilds/" + config.DISCORD_GUILD_ID + "/roles"),
    discordGet<Channel>(
      config,
      "/channels/" + DEPARTMENTS[department].destination,
    ),
  ]);
  return evaluateChannel(config, actor, department, action, { roles, channel });
}
export async function visibleDepartments(
  config: Config,
  actor: Identity,
): Promise<DepartmentKey[]> {
  const candidates = (Object.keys(DEPARTMENTS) as DepartmentKey[]).filter(
    (d) =>
      actor.roles.includes(config.ADMIN_ROLE_ID) ||
      actor.roles.includes(DEPARTMENTS[d].role),
  );
  if (!candidates.length) return [];
  const roles = await discordGet<Role[]>(
    config,
    "/guilds/" + config.DISCORD_GUILD_ID + "/roles",
  );
  const results = await Promise.all(
    candidates.map(async (department) => {
      const channel = await discordGet<Channel>(
        config,
        "/channels/" + DEPARTMENTS[department].destination,
      );
      return evaluateChannel(config, actor, department, "read", {
        roles,
        channel,
      })
        ? department
        : null;
    }),
  );
  return results.filter((x): x is DepartmentKey => x !== null);
}
