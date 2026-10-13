/** Versioned public contract for the separately deployed TFL Studio dashboard. */
const str=(maxLength?:number)=>({type:"string",...(maxLength?{maxLength}:{})});
const integer={type:"integer",minimum:1};
const datetime={type:"string",format:"date-time"};
const snowflake={type:"string",pattern:"^[0-9]{17,20}$"};
const bool={type:"boolean"};
const obj=(properties:Record<string,unknown>,required:string[]=[])=>
 ({type:"object",properties,required,additionalProperties:false});
const array=(item:unknown)=>({type:"array",items:item});
const enumString=(values:string[])=>({type:"string",enum:values});
const money={type:"integer",minimum:-9007199254740991,maximum:9007199254740991};
const statusCode=(code:string)=>({description:code,content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}}});
const schemas={
 GenericResponse:{type:"object",additionalProperties:true},
 Error:obj({error:obj({code:str(),message:str()},["code","message"])},["error"]),
 Paged:obj({items:array({type:"object"}),limit:integer,offset:{type:"integer",minimum:0}},["items","limit","offset"]),
 Mutated:obj({ok:bool},["ok"]),
 ManualReport:obj({department:str(30),title:str(100),description:str(1500),project:{anyOf:[str(80),{type:"null"}]}},["department","title","description"]),
 SingleReport:obj({item:{$ref:"#/components/schemas/Report"}},["item"]),
 Report:obj({id:str(),department:str(),project:{anyOf:[str(),{type:"null"}]},source:str(),
    title:str(),description:str(),sync_state:str(),publication_status:str(),
    discordUrl:{anyOf:[{type:"string",format:"uri"},{type:"null"}]}},["id","department","source","title"]),
 Publication:obj({project:str(120),platform:str(70),url:{type:"string",format:"uri"},publishedAt:datetime,notes:str(2000)},["project","platform","url","publishedAt"]),
 Guide:obj({category:str(100),title:str(160),body:str(15000),
    visibilityDepartment:{anyOf:[str(),{type:"null"}]}},["category","title","body"]),
 GuideUpdate:obj({expectedVersion:integer,category:str(100),title:str(160),body:str(15000),
    visibilityDepartment:{anyOf:[str(),{type:"null"}]}},["expectedVersion","category","title","body","visibilityDepartment"]),
 GuideRestore:obj({expectedVersion:integer,restoreVersion:integer},["expectedVersion","restoreVersion"]),
 GuideLink:obj({expectedVersion:integer,threadId:snowflake},["expectedVersion","threadId"]),
 GuidePublish:obj({expectedVersion:integer,confirm:{const:true},tagIds:array(snowflake)},["expectedVersion","confirm"]),
 ExpectedVersion:obj({expectedVersion:integer},["expectedVersion"]),
 EmbedField:obj({name:str(256),value:str(1024),inline:bool},["name","value"]),
 EmbedAuthor:obj({name:str(256),url:{type:"string",format:"uri"},iconUrl:{type:"string",format:"uri"}},["name"]),
 Embed:obj({title:str(256),description:str(4096),color:{type:"integer",minimum:0,maximum:16777215},
    url:{type:"string",format:"uri"},image:{type:"string",format:"uri"},
    thumbnail:{type:"string",format:"uri"},footer:str(2048),
    author:{$ref:"#/components/schemas/EmbedAuthor"},fields:array({$ref:"#/components/schemas/EmbedField"})}),
 Visual:obj({embeds:{type:"array",maxItems:10,items:{$ref:"#/components/schemas/Embed"}}}),
 Announcement:obj({targetChannelId:snowflake,title:str(100),body:str(1800),
    visual:{$ref:"#/components/schemas/Visual"}},["targetChannelId","title","body"]),
 AnnouncementUpdate:obj({targetChannelId:snowflake,title:str(100),body:str(1800),
    visual:{$ref:"#/components/schemas/Visual"},expectedVersion:integer},
    ["targetChannelId","title","body","expectedVersion"]),
 Schedule:obj({runAt:datetime,confirm:{const:true}},["runAt","confirm"]),
 Confirm:obj({confirm:{const:true}},["confirm"]),
 Template:obj({name:str(90),visual:{$ref:"#/components/schemas/Visual"}},["name","visual"]),
 TemplateUpdate:obj({name:str(90),visual:{$ref:"#/components/schemas/Visual"},expectedVersion:integer},
    ["name","visual","expectedVersion"]),
 Reason:obj({reason:str(500)},["reason"]),
 GithubSource:obj({repository:str(),department:str(),defaultBranch:str(100)},["repository","department"]),
 GithubSettings:obj({enabled:bool,pushEnabled:bool,releaseEnabled:bool,batchMinutes:integer,defaultBranch:str(100),allowPrereleases:bool},
    ["enabled","pushEnabled","releaseEnabled","batchMinutes"]),
 GithubSync:obj({commits:bool,releases:bool}),
 StaffAssignment:obj({userId:snowflake,department:str()},["userId","department"]),
 BillingRecord:obj({label:str(160),amountMinor:money,currency:str(3),category:str(100),
    dueAt:{anyOf:[datetime,{type:"null"}]},notes:str(1000),status:enumString(["active","archived","void"])},
    ["label","amountMinor","currency","category"]),
 BillingRecordUpdate:obj({label:str(160),amountMinor:money,currency:str(3),category:str(100),dueAt:{anyOf:[datetime,{type:"null"}]},
    notes:str(1000),status:enumString(["active","archived","void"]),expectedVersion:integer,reason:str(500)},
    ["label","amountMinor","currency","category","expectedVersion","reason"]),
 BillingSubscription:obj({label:str(160),provider:str(120),amountMinor:money,currency:str(3),cadenceMonths:integer,
    nextDueAt:datetime,notes:str(1000),status:enumString(["active","paused","cancelled"])},
    ["label","provider","amountMinor","currency","cadenceMonths","nextDueAt"]),
 BillingSubscriptionUpdate:obj({label:str(160),provider:str(120),amountMinor:money,currency:str(3),cadenceMonths:integer,
    nextDueAt:datetime,notes:str(1000),status:enumString(["active","paused","cancelled"]),expectedVersion:integer,reason:str(500)},
    ["label","provider","amountMinor","currency","cadenceMonths","nextDueAt","expectedVersion","reason"]),
 Automation:obj({name:str(90),description:str(500),
    kind:enumString(["github_sync","github_releases_sync","github_push_summary","announcement","report_watch","admin_notice","maintenance"]),
    triggerKind:enumString(["manual","interval"]),intervalMinutes:{anyOf:[integer,{type:"null"}]},config:{type:"object"}},
    ["name","kind","triggerKind","config"]),
 AutomationUpdate:obj({name:str(90),description:str(500),kind:str(),triggerKind:str(),
    intervalMinutes:{anyOf:[integer,{type:"null"}]},config:{type:"object"},expectedVersion:integer},
    ["name","kind","triggerKind","config","expectedVersion"]),
 AutomationToggle:obj({expectedVersion:integer,enabled:bool},["expectedVersion","enabled"]),
 AuditorOptions:obj({includeArchived:bool,maxArchivedPerForum:integer}),
 IndexSourceSettings:obj({enabled:bool,captureContent:bool,historicalEnabled:bool},
    ["enabled","captureContent","historicalEnabled"]),
 StartImport:obj({sourceId:integer,dryRun:bool},["sourceId"]),
 JobReconcile:{oneOf:[
    obj({action:{const:"link"},channelId:snowflake,messageId:snowflake,reason:str(500)},["action","channelId","messageId","reason"]),
    obj({action:{const:"retry"},confirmRemoteAbsent:{const:true},reason:str(500)},["action","confirmRemoteAbsent","reason"]),
    obj({action:{const:"cancel"},reason:str(500)},["action","reason"])
 ]},
 JobCancel:obj({reason:str(500)},["reason"])
};
const routes:[string,string[],string?][]=[
 ["/api/v1/health/live",["get"]],["/api/v1/health/ready",["get"]],
 ["/api/v1/openapi.json",["get"]],
 ["/api/v1/auth/login",["get"]],["/api/v1/auth/callback",["get"]],
 ["/api/v1/auth/me",["get"]],["/api/v1/auth/logout",["post"]],
 ["/api/v1/departments",["get"]],
 ["/api/v1/reports",["get","post"]],["/api/v1/reports/export",["get"]],["/api/v1/reports/{id}",["get"]],
 ["/api/v1/publications",["get","post"]],["/api/v1/publications/stats",["get"]],
 ["/api/v1/guides",["get","post"]],["/api/v1/guides/{id}",["get","patch"]],
 ["/api/v1/guides/{id}/revisions",["get"]],["/api/v1/guides/{id}/restore",["post"]],
 ["/api/v1/guides/{id}/archive",["post"]],["/api/v1/guides/{id}/link",["post"]],
 ["/api/v1/guides/{id}/publish",["post"]],
 ["/api/v1/staff/members/{id}",["get"]],["/api/v1/staff/directory",["get"]],
 ["/api/v1/staff/assignments",["get","put"]],
 ["/api/v1/billing",["get","post"]],["/api/v1/billing/{id}",["get","patch"]],
 ["/api/v1/billing/history",["get"]],["/api/v1/billing/summary",["get"]],
 ["/api/v1/billing/subscriptions",["get","post"]],["/api/v1/billing/subscriptions/due",["get"]],
 ["/api/v1/billing/subscriptions/{id}",["get","patch"]],
 ["/api/v1/announcements",["get","post"]],["/api/v1/announcements/{id}",["get","patch"]],
 ["/api/v1/announcements/{id}/preview",["get"]],["/api/v1/announcements/{id}/history",["get"]],
 ["/api/v1/announcements/{id}/duplicate",["post"]],["/api/v1/announcements/{id}/schedule",["post"]],
 ["/api/v1/announcements/{id}/reschedule",["post"]],["/api/v1/announcements/{id}/publish-now",["post"]],
 ["/api/v1/announcements/{id}/cancel",["post"]],
 ["/api/v1/announcements/templates",["get","post"]],
 ["/api/v1/announcements/templates/{id}",["patch"]],
 ["/api/v1/announcements/templates/{id}/disable",["post"]],
 ["/api/v1/automations",["get","post"]],["/api/v1/automations/notifications",["get"]],
 ["/api/v1/automations/notifications/{id}/acknowledge",["post"]],
 ["/api/v1/automations/{id}",["get","patch"]],
 ["/api/v1/automations/{id}/enable",["post"]],["/api/v1/automations/{id}/run",["post"]],
 ["/api/v1/automations/{id}/executions",["get"]],
 ["/api/v1/github/sources",["get","post"]],["/api/v1/github/sources/{id}",["patch"]],
 ["/api/v1/github/sources/{id}/sync",["post"]],
 ["/api/v1/github/sources/{id}/coverage/acknowledge",["post"]],
 ["/api/v1/github/commits",["get"]],["/api/v1/github/releases",["get"]],
 ["/api/v1/github/releases/{id}/commits",["get"]],
 ["/api/v1/jobs",["get"]],["/api/v1/jobs/metrics",["get"]],["/api/v1/jobs/{id}",["get"]],
 ["/api/v1/jobs/{id}/reconcile",["post"]],["/api/v1/jobs/{id}/cancel",["post"]],
 ["/api/v1/report-index/coverage",["get"]],["/api/v1/report-index/sources",["get"]],
 ["/api/v1/report-index/sources/{id}",["patch"]],
 ["/api/v1/report-index/imports",["get","post"]],["/api/v1/report-index/imports/recover",["post"]],
 ["/api/v1/report-index/imports/{id}",["get"]],
 ["/api/v1/report-index/imports/{id}/resume",["post"]],
 ["/api/v1/report-index/imports/{id}/pause",["post"]],
 ["/api/v1/report-index/imports/{id}/cancel",["post"]],
 ["/api/v1/auditor/snapshots",["get","post"]],
 ["/api/v1/auditor/snapshots/{id}",["get"]],
 ["/api/v1/auditor/snapshots/{id}/download",["get"]],
 ["/api/v1/auditor/snapshots/{id}/compare",["get"]],
 ["/api/v1/audit",["get"]],["/api/v1/stats",["get"]],["/api/v1/diagnostics",["get"]],
 ["/api/v1/integrations/github/webhook",["post"]]
];
const inputs:Record<string,keyof typeof schemas>={
 "POST /api/v1/reports":"ManualReport","POST /api/v1/publications":"Publication",
 "POST /api/v1/guides":"Guide","PATCH /api/v1/guides/{id}":"GuideUpdate",
 "POST /api/v1/guides/{id}/restore":"GuideRestore",
 "POST /api/v1/guides/{id}/archive":"ExpectedVersion",
 "POST /api/v1/guides/{id}/link":"GuideLink",
 "POST /api/v1/guides/{id}/publish":"GuidePublish",
 "PUT /api/v1/staff/assignments":"StaffAssignment",
 "POST /api/v1/billing":"BillingRecord","PATCH /api/v1/billing/{id}":"BillingRecordUpdate",
 "POST /api/v1/billing/subscriptions":"BillingSubscription",
 "PATCH /api/v1/billing/subscriptions/{id}":"BillingSubscriptionUpdate",
 "POST /api/v1/announcements":"Announcement",
 "PATCH /api/v1/announcements/{id}":"AnnouncementUpdate",
 "POST /api/v1/announcements/{id}/schedule":"Schedule",
 "POST /api/v1/announcements/{id}/reschedule":"Schedule",
 "POST /api/v1/announcements/{id}/publish-now":"Confirm",
 "POST /api/v1/announcements/{id}/cancel":"Reason",
 "POST /api/v1/announcements/templates":"Template",
 "PATCH /api/v1/announcements/templates/{id}":"TemplateUpdate",
 "POST /api/v1/automations":"Automation","PATCH /api/v1/automations/{id}":"AutomationUpdate",
 "POST /api/v1/automations/{id}/enable":"AutomationToggle",
 "POST /api/v1/automations/{id}/run":"Confirm",
 "POST /api/v1/github/sources":"GithubSource",
 "PATCH /api/v1/github/sources/{id}":"GithubSettings",
 "POST /api/v1/github/sources/{id}/sync":"GithubSync",
 "POST /api/v1/report-index/imports":"StartImport",
 "PATCH /api/v1/report-index/sources/{id}":"IndexSourceSettings",
 "POST /api/v1/jobs/{id}/reconcile":"JobReconcile",
 "POST /api/v1/jobs/{id}/cancel":"JobCancel",
 "POST /api/v1/auditor/snapshots":"AuditorOptions",
 "POST /api/v1/github/sources/{id}/coverage/acknowledge":"Reason"
};
const publicRoutes=new Set([
 "/api/v1/health/live","/api/v1/health/ready","/api/v1/openapi.json",
 "/api/v1/auth/login","/api/v1/auth/callback","/api/v1/integrations/github/webhook"
]);
const admins=[
 "/api/v1/billing","/api/v1/announcements","/api/v1/automations",
 "/api/v1/staff","/api/v1/jobs","/api/v1/auditor",
 "/api/v1/report-index","/api/v1/github","/api/v1/audit","/api/v1/diagnostics",
 "/api/v1/reports/export"
];
const limitOffset=[
 "/api/v1/reports","/api/v1/reports/export","/api/v1/guides","/api/v1/billing",
 "/api/v1/announcements","/api/v1/jobs","/api/v1/automations",
 "/api/v1/report-index/imports","/api/v1/auditor/snapshots",
 "/api/v1/github/commits","/api/v1/github/releases"
];
const ref=(name:keyof typeof schemas)=>({$ref:"#/components/schemas/"+name});
const operation=(path:string,method:string)=>{
 const key=method.toUpperCase()+" "+path;
 const schema=inputs[key];
 const publicEndpoint=publicRoutes.has(path);
 const admin=admins.some(p=>path===p||path.startsWith(p+"/"));
 const read=method==="get";
 const params:unknown[]=[];
 if(path.includes("{id}"))params.push({
  name:"id",in:"path",required:true,
  schema:path.startsWith("/api/v1/staff/members/")?snowflake:integer
 });
 if(read && limitOffset.some(p=>p===path))params.push(
  {name:"limit",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:500}},
  {name:"offset",in:"query",required:false,schema:{type:"integer",minimum:0}}
 );
 if(!read&&!publicEndpoint)params.push({
  name:"X-CSRF-Token",in:"header",required:true,schema:str(),
  description:"CSRF HMAC token obtained from GET /api/v1/auth/me"
 });
 if(key==="POST /api/v1/reports"||key==="POST /api/v1/automations/{id}/run")
  params.push({name:"Idempotency-Key",in:"header",required:true,schema:str(128)});
 const response=read&&path==="/api/v1/reports"?ref("Paged"):
  read&&path==="/api/v1/reports/{id}"?ref("SingleReport"):
  read&&limitOffset.some(p=>p===path)?ref("Paged"):ref("GenericResponse");
 const inputsType=schema ? {requestBody:{
  required:true,content:{"application/json":{schema:ref(schema)}}
 }} : {};
 const jsonResponse=path==="/api/v1/integrations/github/webhook"?{type:"object"}:response;
 return {
  operationId:method+path.replaceAll(/[^A-Za-z0-9]+/g,"_"),
  summary:key,
  tags:[admin?"ADMIN":publicEndpoint?"Public":"Department"],
  description:publicEndpoint?"Public endpoint or cryptographically signed webhook.":
    admin?"ADMIN only; current Discord membership and role verified for every request.":
    "Requires active membership and current per-resource Discord permissions.",
  security:publicEndpoint?[]:[{session:[]}],
  ...(params.length?{parameters:params}:{}),
  ...inputsType,
  responses:{
   "200":{description:"Operation completed or current resource state",content:{"application/json":{schema:jsonResponse}}},
   "400":statusCode("Invalid input"),"401":statusCode("Unauthenticated"),
   "403":statusCode("Forbidden"),"404":statusCode("Not found"),"409":statusCode("State conflict"),
   "429":statusCode("Rate limited"),"500":statusCode("Internal error"),"503":statusCode("Dependency unavailable")
  }
 };
};
export const OPENAPI={
 openapi:"3.1.0",
 info:{title:"TFL Studio Core API",version:"0.3.0",
  description:"Private guild-specific backend; separate Vercel dashboard. OAuth2 sessions with HttpOnly SameSite=Lax cookies, live Discord authorization, X-CSRF-Token for mutations, SQL outbox. Discord/GitHub side effects are asynchronous and require explicit enablement."},
 servers:[{url:"/"}],
 components:{securitySchemes:{session:{type:"apiKey",in:"cookie",name:"tfl_studio_session"}},schemas},
 paths:Object.fromEntries(routes.map(([path,methods])=>
   [path,Object.fromEntries(methods.map(method=>[method,operation(path,method)]))]))
};
