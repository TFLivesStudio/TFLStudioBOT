import type { Config } from "./config.js";
import { DEPARTMENTS, type DepartmentKey } from "./ids.js";
import type { Identity } from "./auth.js";

const bits = {
  administrator: 1n << 3n,
  viewChannel: 1n << 10n,
  sendMessages: 1n << 11n,
  createPublicThreads: 1n << 35n
};
type Role = {id:string;permissions:string};
type Overwrite = {id:string;type:number;allow:string;deny:string};
type Channel = {id:string;type:number;permission_overwrites:Overwrite[]};
async function discordGet<T>(config:Config,path:string):Promise<T>{
  const response=await fetch("https://discord.com/api/v10"+path,{headers:{Authorization:"Bot "+config.BOT_TOKEN}});
  if(!response.ok) throw new Error("Discord authorization unavailable: "+response.status);
  return response.json() as Promise<T>;
}
function apply(flags:bigint,deny:string,allow:string):bigint{
  return (flags & ~BigInt(deny)) | BigInt(allow);
}
function check(config:Config,identity:Identity,department:DepartmentKey,mode:"read"|"write",roles:Role[],channel:Channel):boolean{
  if(!identity.roles.includes(config.ADMIN_ROLE_ID) && !identity.roles.includes(DEPARTMENTS[department].role)) return false;
  const base=roles.find(r=>r.id===config.DISCORD_GUILD_ID);
  if(!base) return false;
  let flags=BigInt(base.permissions);
  for(const role of roles)if(identity.roles.includes(role.id))flags|=BigInt(role.permissions);
  if((flags & bits.administrator)!==0n) return true;
  const everyone=channel.permission_overwrites.find(o=>o.id===config.DISCORD_GUILD_ID);
  if(everyone)flags=apply(flags,everyone.deny,everyone.allow);
  let allowed=0n,denied=0n;
  for(const o of channel.permission_overwrites){
    if(o.type===0 && identity.roles.includes(o.id)){allowed|=BigInt(o.allow);denied|=BigInt(o.deny);}
  }
  flags=(flags & ~denied)|allowed;
  const member=channel.permission_overwrites.find(o=>o.type===1 && o.id===identity.userId);
  if(member)flags=apply(flags,member.deny,member.allow);
  const required=mode==="read"?bits.viewChannel:bits.viewChannel | (channel.type===15?bits.createPublicThreads:bits.sendMessages);
  return (flags & required)===required;
}
/** Current REST-effective permissions, fail closed on Discord errors. */
export async function canUseChannel(config:Config,identity:Identity,department:DepartmentKey,mode:"read"|"write"):Promise<boolean>{
  if(!identity.roles.includes(config.ADMIN_ROLE_ID) && !identity.roles.includes(DEPARTMENTS[department].role))return false;
  const [roles,channel]=await Promise.all([
    discordGet<Role[]>(config,"/guilds/"+config.DISCORD_GUILD_ID+"/roles"),
    discordGet<Channel>(config,"/channels/"+DEPARTMENTS[department].destination)
  ]);
  return check(config,identity,department,mode,roles,channel);
}
/** Batch authorization: fetch guild roles once and only the channels with role eligibility. */
export async function visibleDepartments(config:Config,identity:Identity):Promise<DepartmentKey[]>{
  const candidate=(Object.keys(DEPARTMENTS) as DepartmentKey[]).filter(d=>identity.roles.includes(config.ADMIN_ROLE_ID)||identity.roles.includes(DEPARTMENTS[d].role));
  if(!candidate.length)return [];
  const roles=await discordGet<Role[]>(config,"/guilds/"+config.DISCORD_GUILD_ID+"/roles");
  const results=await Promise.all(candidate.map(async d=>{
    const channel=await discordGet<Channel>(config,"/channels/"+DEPARTMENTS[d].destination);
    return check(config,identity,d,"read",roles,channel)?d:null;
  }));
  return results.filter((x):x is DepartmentKey=>x!==null);
}
