/** Independent versioned API contract, no dashboard code in the backend. */
const string = (maxLength?: number) => ({type:"string", ...(maxLength?{maxLength}:{})});
const integer = {type:"integer"};
const date = {type:"string",format:"date-time"};
const bool = {type:"boolean"};
const id = {type:"string",pattern:"^[0-9]{17,20}$"};
const object = (properties:Record<string,unknown>,required:string[]=[]) => ({type:"object",properties,required,additionalProperties:false});
const schemas={
  Error:object({error:object({code:string(),message:string()},["code","message"])},["error"]),
  ManualReport:object({department:string(),title:string(100),description:string(1500),project:string(80)},["department","title","description"]),
  Publication:object({project:string(120),platform:string(70),url:{type:"string",format:"uri"},publishedAt:date,notes:string(2000)},["project","platform","url","publishedAt"]),
  Guide:object({category:string(100),title:string(160),body:string(15000),visibilityDepartment:{anyOf:[string(),{type:"null"}]},discordThreadId:{anyOf:[id,{type:"null"}]}},["category","title","body"]),
  GuideUpdate:object({expectedVersion:integer,category:string(100),title:string(160),body:string(15000),visibilityDepartment:{anyOf:[string(),{type:"null"}]}},["expectedVersion","category","title","body","visibilityDepartment"]),
  EmbedField:object({name:string(256),value:string(1024),inline:bool},["name","value"]),
  Embed:object({title:string(256),description:string(4096),color:integer,footer:string(2048),fields:{type:"array",items:{$ref:"#/components/schemas/EmbedField"}}}),
  Visual:object({embeds:{type:"array",maxItems:3,items:{$ref:"#/components/schemas/Embed"}}}),
  Announcement:object({targetChannelId:id,title:string(100),body:string(1800),visual:{$ref:"#/components/schemas/Visual"}},["targetChannelId","title","body"]),
  Schedule:object({runAt:date,confirm:{type:"boolean",const:true}},["runAt","confirm"]),
  Template:object({name:string(90),visual:{$ref:"#/components/schemas/Visual"}},["name","visual"]),
  GithubSource:object({repository:string(),department:string(),defaultBranch:string()},["repository","department"]),
  GithubSettings:object({enabled:bool,pushEnabled:bool,releaseEnabled:bool,batchMinutes:integer,defaultBranch:string(100),allowPrereleases:bool},["enabled","pushEnabled","releaseEnabled","batchMinutes"]),
  StaffAssignment:object({userId:id,department:string()},["userId","department"]),
  BillingSubscription:object({label:string(160),provider:string(120),amountMinor:integer,currency:string(3),cadenceMonths:integer,nextDueAt:date,notes:string(1000)},["label","provider","amountMinor","currency","cadenceMonths","nextDueAt"]),
  BillingSubscriptionUpdate:object({status:{type:"string",enum:["active","paused","cancelled"]},nextDueAt:date},["status","nextDueAt"]),
  AuditorOptions:object({includeArchived:bool,maxArchivedPerForum:integer}),
  IndexSourceSettings:object({enabled:bool,captureContent:bool,historicalEnabled:bool},["enabled","captureContent","historicalEnabled"]),
  StartImport:object({sourceId:integer,dryRun:bool},["sourceId"]),
  JobReconcile:{oneOf:[
    object({action:{const:"link"},channelId:id,messageId:id,reason:string(500)},["action","channelId","messageId","reason"]),
    object({action:{const:"retry"},confirmRemoteAbsent:{const:true},reason:string(500)},["action","confirmRemoteAbsent","reason"]),
    object({action:{const:"cancel"},reason:string(500)},["action","reason"])
  ]},
  JobCancel:object({reason:string(500)},["reason"]),
  GithubSync:object({commits:bool,releases:bool}),
  Billing:object({label:string(160),amountMinor:integer,currency:string(3),category:string(100),dueAt:{anyOf:[date,{type:"null"}]}},["label","amountMinor","currency","category"])
};
const input:Record<string,string>={
 "POST /api/v1/reports":"ManualReport",
 "POST /api/v1/publications":"Publication",
 "POST /api/v1/guides":"Guide",
 "PATCH /api/v1/guides/{id}":"GuideUpdate",
 "PUT /api/v1/staff/assignments":"StaffAssignment",
 "POST /api/v1/billing":"Billing",
 "POST /api/v1/billing/subscriptions":"BillingSubscription",
 "PATCH /api/v1/billing/subscriptions/{id}":"BillingSubscriptionUpdate",
 "POST /api/v1/announcements":"Announcement",
 "POST /api/v1/announcements/{id}/schedule":"Schedule",
 "POST /api/v1/announcements/templates":"Template",
 "POST /api/v1/github/sources":"GithubSource",
 "PATCH /api/v1/github/sources/{id}":"GithubSettings",
 "POST /api/v1/github/sources/{id}/sync":"GithubSync",
 "POST /api/v1/report-index/imports":"StartImport",
 "PATCH /api/v1/report-index/sources/{id}":"IndexSourceSettings",
 "POST /api/v1/jobs/{id}/reconcile":"JobReconcile",
 "POST /api/v1/jobs/{id}/cancel":"JobCancel",
 "POST /api/v1/auditor/snapshots":"AuditorOptions"
};
const endpointList:[string,string[]][]=[
  ["/api/v1/health/live",["get"]],["/api/v1/health/ready",["get"]],
  ["/api/v1/auth/login",["get"]],["/api/v1/auth/callback",["get"]],
  ["/api/v1/auth/me",["get"]],["/api/v1/auth/logout",["post"]],
  ["/api/v1/departments",["get"]],["/api/v1/reports",["get","post"]],["/api/v1/reports/{id}",["get"]],
  ["/api/v1/publications",["get","post"]],["/api/v1/publications/stats",["get"]],["/api/v1/guides",["get","post"]],
  ["/api/v1/guides/{id}/revisions",["get"]],
  ["/api/v1/guides/{id}",["patch"]],
  ["/api/v1/staff/assignments",["get","put"]],["/api/v1/staff/directory",["get"]],["/api/v1/staff/members/{id}",["get"]],["/api/v1/billing",["get","post"]],
  ["/api/v1/billing/subscriptions",["get","post"]],["/api/v1/billing/subscriptions/{id}",["patch"]],
  ["/api/v1/announcements",["get","post"]],["/api/v1/announcements/{id}/schedule",["post"]],
  ["/api/v1/announcements/{id}/preview",["get"]],["/api/v1/announcements/templates",["get","post"]],
  ["/api/v1/github/sources",["get","post"]],["/api/v1/github/sources/{id}",["patch"]],["/api/v1/github/sources/{id}/sync",["post"]],["/api/v1/github/sources/{id}/coverage/acknowledge",["post"]],
  ["/api/v1/jobs",["get"]],["/api/v1/jobs/{id}",["get"]],
  ["/api/v1/jobs/{id}/reconcile",["post"]],["/api/v1/jobs/{id}/cancel",["post"]],
  ["/api/v1/report-index/coverage",["get"]],["/api/v1/report-index/sources",["get"]],["/api/v1/report-index/sources/{id}",["patch"]],
  ["/api/v1/report-index/imports",["get","post"]],["/api/v1/report-index/imports/{id}",["get"]],
  ["/api/v1/report-index/imports/{id}/resume",["post"]],["/api/v1/report-index/imports/{id}/cancel",["post"]],
  ["/api/v1/auditor/snapshots",["get","post"]],["/api/v1/auditor/snapshots/{id}",["get"]],
  ["/api/v1/auditor/snapshots/{id}/download",["get"]],["/api/v1/auditor/snapshots/{id}/compare",["get"]],
  ["/api/v1/audit",["get"]],["/api/v1/stats",["get"]],
  ["/api/v1/integrations/github/webhook",["post"]]
];
const unauthenticated=new Set(["/api/v1/health/live","/api/v1/health/ready","/api/v1/auth/login","/api/v1/auth/callback","/api/v1/integrations/github/webhook"]);
const operation=(path:string,method:string)=>{
  const key=method.toUpperCase()+" "+path;
  const schemaName=input[key];
  const params=path.includes("{id}")?[{in:"path",name:"id",required:true,schema:path.includes("members")?id:{type:"integer",minimum:1}}]:[];
  return {
    operationId:method+path.replaceAll(/[^a-z0-9]+/gi,"_"),
    summary:key,
    description:method==="get"?"Read-only operation. Resource scope is enforced server-side.":"Mutating operation: ADMIN or department permission, valid Origin and X-CSRF-Token required unless GitHub signed webhook.",
    ...(unauthenticated.has(path)?{security:[]}:{security:[{session:[]}]}),
    ...(method==="get" && ["/api/v1/reports","/api/v1/jobs","/api/v1/report-index/imports","/api/v1/auditor/snapshots"].includes(path)
      ?{parameters:[{name:"limit",in:"query",required:false,schema:{type:"integer",minimum:1,maximum:100}},{name:"offset",in:"query",required:false,schema:{type:"integer",minimum:0}}]}:{}),
    ...(params.length?{parameters:params}:{}),
    ...(schemaName?{requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/"+schemaName}}}}}:{}),
    responses:{"200":{description:"Operation successful"},"400":{description:"Invalid request",content:{"application/json":{schema:{$ref:"#/components/schemas/Error"}}}},
      "401":{description:"Not authenticated"},"403":{description:"Forbidden"},
      "409":{description:"Conflict or unsafe state transition"},
      "429":{description:"Rate limited"},"500":{description:"Internal error"},"503":{description:"Dependency unavailable"}}
  };
};
export const OPENAPI={
  openapi:"3.1.0",
  info:{title:"TFL Studio Core API",version:"0.1.0",description:"Private API for separate dashboard clients. OAuth2 handled by backend; same-site session cookie and stable CSRF header for mutations; response fields evolve within API version. Restricted endpoints enforce current Discord membership and permissions."},
  servers:[{url:"/"}],
  components:{securitySchemes:{session:{type:"apiKey",in:"cookie",name:"tfl_studio_session"}},schemas},
  paths:Object.fromEntries(endpointList.map(([path,methods])=>[path,Object.fromEntries(methods.map(method=>[method,operation(path,method)]))]))
};
