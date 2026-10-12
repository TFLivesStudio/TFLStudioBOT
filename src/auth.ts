import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { DB } from "./db.js";
import type { Config } from "./config.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import { canUseChannel } from "./permissions.js";

const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const cookieName = "tfl_studio_session";
function cookies(req: FastifyRequest): Record<string,string> {
  return Object.fromEntries((req.headers.cookie ?? "").split(";").map(p => {
    const x = p.trim().split("="); return [x[0] ?? "", x.slice(1).join("=")];
  }));
}
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
/** HMAC bound to the random HttpOnly session cookie: stable across tabs, revoked on logout. */
export function csrfToken(session: string, secret: string): string {
  return createHmac("sha256", secret).update("TFL-STUDIO-CSRF-V1:").update(session).digest("base64url");
}
export function setCookie(reply: FastifyReply, name: string, value: string, config: Config, maxAge: number): void {
  const values = [name + "=" + encodeURIComponent(value), "Path=/", "Max-Age=" + maxAge, "SameSite=Lax", "HttpOnly"];
  if (config.COOKIE_SECURE) values.push("Secure");
  const previous = reply.getHeader("Set-Cookie");
  const existing = Array.isArray(previous) ? previous.map(String) : previous ? [String(previous)] : [];
  reply.header("Set-Cookie", [...existing, values.join("; ")]);
}
export async function beginOAuth(reply: FastifyReply, config: Config): Promise<void> {
  const state = random();
  setCookie(reply, "tfl_oauth_state", state, config, 600);
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", config.DISCORD_CLIENT_ID);
  url.searchParams.set("redirect_uri", config.PUBLIC_API_URL + "/api/v1/auth/callback");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  reply.redirect(url.toString());
}
export type Identity = {userId:string; roles:string[]; csrfHash:string};
export async function loadMember(config: Config, userId: string): Promise<{roles:string[];pending?:boolean}|null> {
  const res = await fetch("https://discord.com/api/v10/guilds/" + config.DISCORD_GUILD_ID + "/members/" + userId, {
    headers: { Authorization: "Bot " + config.BOT_TOKEN },
    signal: AbortSignal.timeout(10000)
  });
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error("Cannot verify Discord membership"), {statusCode:503});
  return res.json() as Promise<{roles:string[];pending?:boolean}>;
}
export async function completeOAuth(req: FastifyRequest, reply: FastifyReply, config: Config, db: DB, code: string, state: string): Promise<void> {
  const expected = cookies(req).tfl_oauth_state;
  if (!expected || !safeEqual(expected, state)) throw Object.assign(new Error("Invalid OAuth state"), {statusCode:403});
  setCookie(reply, "tfl_oauth_state", "", config, 0);
  const form = new URLSearchParams({ client_id: config.DISCORD_CLIENT_ID, client_secret: config.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: config.PUBLIC_API_URL + "/api/v1/auth/callback" });
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: form, signal: AbortSignal.timeout(10000) });
  if (!tokenRes.ok) throw Object.assign(new Error("Discord OAuth exchange failed"), {statusCode:502});
  const token = await tokenRes.json() as {access_token:string};
  const meRes = await fetch("https://discord.com/api/v10/users/@me", { headers: { Authorization: "Bearer " + token.access_token }, signal: AbortSignal.timeout(10000) });
  if (!meRes.ok) throw Object.assign(new Error("Discord identity unavailable"), {statusCode:502});
  const me = await meRes.json() as {id:string};
  const member = await loadMember(config, me.id);
  if (!member || member.pending) { reply.code(403).send({error:{code:"FORBIDDEN",message:"Membership not approved"}}); return; }
  const session = random();
  await db.query("INSERT INTO sessions(token_hash,user_id,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '7 days')", [digest(session), me.id, digest(csrfToken(session, config.SESSION_SECRET))]);
  setCookie(reply, cookieName, session, config, 604800);
  reply.redirect(config.FRONTEND_URL);
}
export async function identify(req: FastifyRequest, db: DB, config: Config): Promise<Identity | null> {
  const token = cookies(req)[cookieName];
  if (!token || token.length > 128) return null;
  const session = await db.query<{user_id:string;csrf_hash:string}>("SELECT user_id,csrf_hash FROM sessions WHERE token_hash=$1 AND expires_at>now()", [digest(token)]);
  const data = session.rows[0];
  if (!data) return null;
  const member = await loadMember(config, data.user_id);
  if (!member || member.pending) return null;
  return {userId:data.user_id, roles:member.roles, csrfHash:data.csrf_hash};
}
export async function requireUser(req: FastifyRequest, db: DB, config: Config, options: {admin?:boolean;department?:DepartmentKey;mutation?:boolean} = {}): Promise<Identity> {
  const identity = await identify(req, db, config);
  if (!identity) throw Object.assign(new Error("Unauthorized"), {statusCode:401});
  if (options.admin && !identity.roles.includes(config.ADMIN_ROLE_ID)) throw Object.assign(new Error("Forbidden"), {statusCode:403});
  if (options.department && !await canUseChannel(config, identity, options.department, options.mutation ? "write" : "read")) throw Object.assign(new Error("Forbidden"), {statusCode:403});
  if (options.mutation) {
    const header = req.headers["x-csrf-token"];
    if (typeof header !== "string" || !safeEqual(digest(header), identity.csrfHash)) throw Object.assign(new Error("CSRF validation failed"), {statusCode:403});
  }
  return identity;
}
export function canAccess(identity: Identity, department: DepartmentKey, config: Config): boolean {
  return identity.roles.includes(config.ADMIN_ROLE_ID) || identity.roles.includes(DEPARTMENTS[department].role);
}
export function isAdmin(identity: Identity, config: Config): boolean { return identity.roles.includes(config.ADMIN_ROLE_ID); }
/** No rotation on GET: concurrent dashboard tabs receive the same CSRF token. */
export function refreshCsrf(_db: DB, req: FastifyRequest, config: Config): string {
  const token = cookies(req)[cookieName];
  if (!token) throw Object.assign(new Error("No session"), {statusCode:401});
  return csrfToken(token, config.SESSION_SECRET);
}
export async function logout(req: FastifyRequest, reply: FastifyReply, db: DB, config: Config): Promise<void> {
  const token = cookies(req)[cookieName];
  if (token) await db.query("DELETE FROM sessions WHERE token_hash=$1", [digest(token)]);
  setCookie(reply,cookieName,"",config,0);
}
