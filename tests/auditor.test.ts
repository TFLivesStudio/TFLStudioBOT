import { test } from "node:test";
import { strict as assert } from "node:assert";
import { compareSnapshots, type AuditSnapshot } from "../src/auditor.js";
const base={
  schemaVersion:2,application:"TFL Studio Core",capturedAt:"2026-10-12T00:00:00.000Z",guildId:"1264656310205415474",
  scope:{messageBodies:false,attachmentData:false,memberCensus:false,archivedRequested:false},
  sections:{channels:{status:"ok",count:1}},guild:{},channels:[{id:"111",name:"before",type:0}],
  roles:[{id:"222",name:"ADMIN"}],emojis:[],stickers:[],autoMod:[],integrations:[],onboarding:null,welcomeScreen:null,
  activeThreads:[],archivedThreads:[],totals:{},completeness:"partial"
} as AuditSnapshot;
test("audit comparison detects changes by stable ID, not names alone",()=>{
  const next:AuditSnapshot={...base,capturedAt:"2026-10-13T00:00:00.000Z",
    channels:[{id:"111",name:"after",type:0},{id:"333",name:"new",type:15}],roles:[]};
  const diff=compareSnapshots(base,next) as {channels:{modified:string[];added:string[]};roles:{removed:string[]}};
  assert.deepEqual(diff.channels.modified,["111"]);
  assert.deepEqual(diff.channels.added,["333"]);
  assert.deepEqual(diff.roles.removed,["222"]);
});
