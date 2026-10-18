import type { Config } from "./config.js";
export type StaffMember = {
  id: string;
  username: string;
  displayName: string | null;
  roles: string[];
  joinedAt: string | null;
  pending: boolean;
};
/** Restrained administrative directory lookup; no member corpus, DMs, or private profile data. */
export async function getStaffMember(
  config: Config,
  id: string,
): Promise<StaffMember | null> {
  const res = await fetch(
    "https://discord.com/api/v10/guilds/" +
      config.DISCORD_GUILD_ID +
      "/members/" +
      id,
    {
      headers: { Authorization: "Bot " + config.BOT_TOKEN },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (res.status === 404) return null;
  if (!res.ok)
    throw new Error("Discord member lookup unavailable: " + res.status);
  const member = (await res.json()) as {
    user?: { id: string; username: string; global_name?: string | null };
    roles: string[];
    joined_at?: string | null;
    pending?: boolean;
    nick?: string | null;
  };
  return {
    id: member.user?.id ?? id,
    username: member.user?.username ?? "Unknown",
    displayName: member.nick ?? member.user?.global_name ?? null,
    roles: member.roles,
    joinedAt: member.joined_at ?? null,
    pending: member.pending ?? false,
  };
}
