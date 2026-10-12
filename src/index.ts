import { readConfig } from "./config.js";
import { openDb, verifySchema } from "./db.js";
import { buildDiscord, registerCommands } from "./discord.js";
import { createHttp } from "./http.js";
import { launchWorker } from "./jobs.js";

const config=readConfig();
const db=openDb(config);
const discord=buildDiscord(config,db);
let stopWorker: (()=>void)|undefined;
let app:Awaited<ReturnType<typeof createHttp>>|undefined;
async function main():Promise<void>{
  if(config.DISCORD_GUILD_ID!=="1264656310205415474" || config.ADMIN_ROLE_ID!=="1282541815802892289") throw new Error("Only audited TFL Studio Guild and ADMIN role are supported");
  await verifySchema(db);
  await discord.login(config.BOT_TOKEN);
  await registerCommands(config);
  app=await createHttp(config,db,discord);
  await app.listen({host:config.HOST,port:config.PORT});
  stopWorker=launchWorker(db,discord,config);
  app.log.info({guild:config.DISCORD_GUILD_ID},"TFL Studio Core started");
}
let stopping=false;
async function stop():Promise<void>{
  if(stopping)return;
  stopping=true;
  stopWorker?.();
  await app?.close().catch(console.error);
  await discord.destroy();
  await db.end();
}
process.on("SIGTERM",()=>void stop().then(()=>process.exit(0)));
process.on("SIGINT",()=>void stop().then(()=>process.exit(0)));
process.on("unhandledRejection",reason=>console.error("unhandled_rejection",reason));
process.on("uncaughtException",e=>{console.error("uncaught_exception",e);void stop().finally(()=>process.exit(1));});
main().catch(e=>{console.error("boot_failed",e);void stop().finally(()=>process.exit(1));});
