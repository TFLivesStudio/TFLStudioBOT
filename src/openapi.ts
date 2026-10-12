/** Stable discovery document. Schemas are implemented as Zod runtime validators in http.ts. */
export const OPENAPI = {
  openapi:"3.1.0",
  info:{title:"TFL Studio Core API",version:"0.1.0",description:"Private administration API. Session cookie + X-CSRF-Token for writes. All data is permission scoped."},
  servers:[{url:"/"}],
  components:{securitySchemes:{session:{type:"apiKey",in:"cookie",name:"tfl_studio_session"}}},
  paths:Object.fromEntries([
    ["/api/v1/health/live",["get"]],["/api/v1/health/ready",["get"]],
    ["/api/v1/auth/login",["get"]],["/api/v1/auth/callback",["get"]],
    ["/api/v1/auth/me",["get"]],["/api/v1/auth/logout",["post"]],
    ["/api/v1/departments",["get"]],["/api/v1/reports",["get","post"]],
    ["/api/v1/publications",["get","post"]],["/api/v1/guides",["get","post"]],
    ["/api/v1/staff/assignments",["get","put"]],["/api/v1/billing",["get","post"]],
    ["/api/v1/announcements",["get","post"]],["/api/v1/announcements/{id}/schedule",["post"]],
    ["/api/v1/github/sources",["get"]],["/api/v1/github/sources/{id}",["patch"]],
    ["/api/v1/jobs",["get"]],["/api/v1/audit",["get"]],["/api/v1/stats",["get"]],
    ["/api/v1/integrations/github/webhook",["post"]]
  ].map(([path,methods])=>[path,Object.fromEntries((methods as string[]).map(method=>[method,{summary:method.toUpperCase()+" "+path,security:path.includes("health")||path.includes("auth/login")||path.includes("auth/callback")||path.includes("webhook")?[]:[{session:[]}],responses:{"200":{description:"Success"},"400":{description:"Invalid request"},"401":{description:"Unauthorized"},"403":{description:"Forbidden"}}}]))]))
} as const;
