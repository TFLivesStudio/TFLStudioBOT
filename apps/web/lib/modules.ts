import { DEPARTMENTS, IDS, type Session } from "@tfl/shared";
export type Row = Record<string, unknown>;
export type Field = {
  key: string;
  label: string;
  type?:
    | "text"
    | "textarea"
    | "number"
    | "datetime-local"
    | "checkbox"
    | "select"
    | "visual";
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  value?: unknown;
  help?: string;
};
export type Action = {
  label: string;
  path: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  fields?: Field[];
  defaults?: Row;
  map?: Record<string, string>;
  confirm?: boolean;
  read?: boolean;
  when?: (row: Row) => boolean;
  build?: (values: Row, row: Row) => Row;
};
export type Tab = {
  key: string;
  label: string;
  path: string;
  columns: string[];
  filters?: Field[];
  create?: Action;
  actions?: Action[];
  requiredFilter?: string;
  itemsKey?: string;
  paginated?: boolean;
  detailView?: boolean;
  tools?: Action[];
};
export type Section = {
  key: string;
  label: string;
  description: string;
  admin?: boolean;
  tabs?: Tab[];
};
const f = (
  key: string,
  label: string,
  type: Field["type"] = "text",
  extra: Partial<Field> = {},
): Field => ({ key, label, type, required: true, ...extra });
const opt = (key: string, label: string, options: string[]) =>
  f(key, label, "select", { options });
const dep = opt("department", "Departamento", Object.keys(DEPARTMENTS));
const reason = f("reason", "Motivo", "textarea", { min: 10, max: 500 });
const version = { expectedVersion: "version" };
const future = f("runAt", "Fecha y hora", "datetime-local");
const guideFields = [
  f("title", "Título", "text", { max: 160 }),
  f("category", "Categoría", "text", { max: 100 }),
  f("body", "Contenido", "textarea", { max: 15000 }),
  {
    ...opt("visibilityDepartment", "Visibilidad", [
      "",
      ...Object.keys(DEPARTMENTS),
    ]),
    required: false,
  },
];
const guideBuild = (v: Row) => ({
  ...v,
  visibilityDepartment: v.visibilityDepartment || null,
});
const announcementFields = [
  f("title", "Título", "text", { max: 100 }),
  f("body", "Mensaje", "textarea", { max: 1800 }),
  f("visual", "Embeds", "visual", { required: false }),
];
const annDefaults = {
  targetChannelId: IDS.channels.anuncios,
  visual: { embeds: [] },
};
const annBuild = (v: Row) => ({ ...v, targetChannelId: IDS.channels.anuncios });
const recordFields = [
  f("label", "Concepto", "text", { max: 160 }),
  f("amountMinor", "Cantidad en unidades menores", "number", {
    help: "Entero exacto. Ejemplo: 1900 = 19,00 USD. Negativo para egresos.",
  }),
  f("currency", "Moneda ISO 4217", "text", { value: "USD", min: 3, max: 3 }),
  f("category", "Categoría"),
  f("dueAt", "Vencimiento", "datetime-local", { required: false }),
  f("notes", "Notas", "textarea", { required: false, max: 1000 }),
  opt("status", "Estado", ["active", "archived", "void"]),
];
const subscriptionFields = [
  f("label", "Concepto"),
  f("provider", "Proveedor"),
  f("amountMinor", "Cantidad en unidades menores", "number"),
  f("currency", "Moneda ISO 4217", "text", { value: "USD", min: 3, max: 3 }),
  f("cadenceMonths", "Meses por renovación", "number", {
    min: 1,
    max: 120,
    value: 1,
  }),
  f("nextDueAt", "Próximo vencimiento", "datetime-local"),
  f("notes", "Notas", "textarea", { required: false }),
  opt("status", "Estado", ["active", "paused", "cancelled"]),
];
const billingMap = {
  ...version,
  amountMinor: "amount_minor",
  dueAt: "due_at",
  nextDueAt: "next_due_at",
  cadenceMonths: "cadence_months",
};
const billingBuild = (v: Row) => ({
  ...v,
  currency: String(v.currency).toUpperCase(),
});
const history: Action = {
  label: "Historial",
  path: "/announcements/:id/history",
  read: true,
};
const commonSearch = [f("search", "Buscar", "text", { required: false })];
const filterDep = { ...dep, required: false };
const autoFields = [
  f("name", "Nombre", "text", { min: 3, max: 90 }),
  f("description", "Descripción", "textarea", { required: false, max: 500 }),
  opt("kind", "Acción", [
    "admin_notice",
    "report_watch",
    "maintenance",
    "github_sync",
    "github_releases_sync",
    "github_push_summary",
    "announcement",
  ]),
  opt("triggerKind", "Activación", ["manual", "interval"]),
  f("intervalMinutes", "Intervalo (minutos)", "number", {
    required: false,
    min: 5,
    max: 1440,
  }),
  f("message", "Aviso interno", "textarea", { required: false }),
  f("repository", "Repositorio owner/name", "text", { required: false }),
  { ...dep, required: false },
  f("threshold", "Umbral de reportes", "number", {
    required: false,
    min: 1,
    max: 100000,
  }),
  f("windowMinutes", "Ventana (minutos)", "number", {
    required: false,
    min: 5,
    max: 1440,
  }),
  f("announcementId", "ID de anuncio programado", "number", {
    required: false,
    min: 1,
  }),
];
const autoBuild = (v: Row): Row => {
  const {
    message,
    repository,
    department,
    threshold,
    windowMinutes,
    announcementId,
    ...base
  } = v;
  const kind = String(v.kind);
  const config =
    kind === "admin_notice"
      ? { message }
      : kind === "maintenance"
        ? { operation: "prune_expired_sessions" }
        : kind === "report_watch"
          ? { department, threshold, windowMinutes }
          : kind === "announcement"
            ? { announcementId }
            : { repository };
  return {
    ...base,
    intervalMinutes: v.triggerKind === "interval" ? v.intervalMinutes : null,
    config,
  };
};
const autoCreate: Action = {
  label: "Nueva automatización",
  path: "/automations",
  fields: autoFields,
  build: autoBuild,
};
export const sections: Section[] = [
  {
    key: "overview",
    label: "Vista general",
    description: "Una visión clara de tu equipo y sus operaciones.",
  },
  {
    key: "reports",
    label: "Reportes",
    description: "Avances, publicaciones y trazabilidad en un mismo lugar.",
    tabs: [
      {
        key: "reports",
        label: "Todos los reportes",
        path: "/reports",
        columns: [
          "id",
          "title",
          "department",
          "project",
          "source",
          "publication_status",
          "occurred_at",
        ],
        filters: [
          ...commonSearch,
          filterDep,
          f("project", "Proyecto", "text", { required: false }),
          f("authorId", "ID del autor", "text", { required: false }),
          opt("source", "Origen", [
            "bot",
            "github",
            "discord_manual",
            "manual",
          ]),
          opt("publicationStatus", "Publicación", [
            "queued",
            "publishing",
            "published",
            "needs_reconciliation",
            "indexed",
            "deleted",
            "cancelled",
          ]),
          opt("syncState", "Sincronización", [
            "complete",
            "partial",
            "unknown",
            "missing",
            "deleted",
          ]),
          f("from", "Desde", "datetime-local", { required: false }),
          f("to", "Hasta", "datetime-local", { required: false }),
        ],
        create: {
          label: "Crear reporte",
          path: "/reports",
          fields: [
            dep,
            f("title", "Título", "text", { max: 100 }),
            f("description", "Descripción", "textarea", { max: 1500 }),
            f("project", "Proyecto", "text", { required: false, max: 80 }),
          ],
          build: (v) => ({ ...v, project: v.project || null }),
        },
        actions: [{ label: "Abrir reporte", path: "/reports/:id", read: true }],
      },
      {
        key: "publications",
        label: "Publicaciones publicitarias",
        path: "/publications",
        columns: [
          "id",
          "project",
          "platform",
          "url",
          "published_at",
          "submitted_by",
        ],
        create: {
          label: "Registrar publicación",
          path: "/publications",
          fields: [
            f("project", "Proyecto"),
            f("platform", "Plataforma"),
            f("url", "URL de la publicación"),
            f("publishedAt", "Fecha de publicación", "datetime-local"),
            f("notes", "Notas", "textarea", { required: false }),
          ],
        },
      },
    ],
  },
  {
    key: "announcements",
    label: "Anuncios",
    description: "Del borrador a Discord, con control en cada paso.",
    admin: true,
    tabs: [
      {
        key: "announcements",
        label: "Anuncios",
        path: "/announcements",
        columns: [
          "id",
          "title",
          "status",
          "version",
          "scheduled_at",
          "published_at",
        ],
        filters: [
          opt("status", "Estado", [
            "draft",
            "scheduled",
            "publishing",
            "published",
            "failed",
            "cancelled",
          ]),
        ],
        create: {
          label: "Nuevo anuncio",
          path: "/announcements",
          fields: announcementFields,
          defaults: annDefaults,
          build: annBuild,
        },
        actions: [
          {
            label: "Editar",
            path: "/announcements/:id",
            method: "PATCH",
            fields: announcementFields,
            map: { ...version, visual: "visual_payload" },
            build: annBuild,
            when: (r) => r.status === "draft",
          },
          {
            label: "Vista previa",
            path: "/announcements/:id/preview",
            read: true,
          },
          {
            label: "Duplicar",
            path: "/announcements/:id/duplicate",
            confirm: true,
          },
          {
            label: "Programar",
            path: "/announcements/:id/schedule",
            fields: [future],
            defaults: { confirm: true },
            confirm: true,
            when: (r) => r.status === "draft",
          },
          {
            label: "Publicar ahora",
            path: "/announcements/:id/publish-now",
            defaults: { confirm: true },
            confirm: true,
            when: (r) => r.status === "draft",
          },
          {
            label: "Reprogramar",
            path: "/announcements/:id/reschedule",
            fields: [future],
            defaults: { confirm: true },
            confirm: true,
            when: (r) => r.status === "scheduled",
          },
          {
            label: "Cancelar",
            path: "/announcements/:id/cancel",
            fields: [reason],
            confirm: true,
            when: (r) => r.status === "scheduled",
          },
          history,
          {
            label: "Versiones",
            path: "/announcements/:id/revisions",
            read: true,
          },
        ],
      },
      {
        key: "templates",
        label: "Plantillas",
        path: "/announcements/templates",
        columns: ["id", "name", "version", "enabled"],
        paginated: false,
        create: {
          label: "Nueva plantilla",
          path: "/announcements/templates",
          fields: [f("name", "Nombre"), f("visual", "Embeds", "visual")],
          defaults: { visual: { embeds: [] } },
        },
        actions: [
          {
            label: "Editar",
            path: "/announcements/templates/:id",
            method: "PATCH",
            fields: [f("name", "Nombre"), f("visual", "Embeds", "visual")],
            map: { ...version, visual: "visual_payload" },
            when: (r) => !!r.enabled,
          },
          {
            label: "Deshabilitar",
            path: "/announcements/templates/:id/disable",
            confirm: true,
            when: (r) => !!r.enabled,
          },
        ],
      },
    ],
  },
  {
    key: "guides",
    label: "Guías",
    description: "El conocimiento del equipo, organizado y siempre a mano.",
    tabs: [
      {
        key: "guides",
        label: "Biblioteca interna",
        path: "/guides",
        columns: [
          "id",
          "title",
          "category",
          "visibility_department",
          "lifecycle",
          "version",
          "discord_sync_state",
          "updated_at",
        ],
        filters: [
          ...commonSearch,
          f("category", "Categoría", "text", { required: false }),
          filterDep,
          opt("lifecycle", "Estado", ["active", "archived"]),
        ],
        create: {
          label: "Nueva guía",
          path: "/guides",
          fields: guideFields,
          build: guideBuild,
        },
        actions: [
          { label: "Leer guía", path: "/guides/:id", read: true },
          {
            label: "Editar",
            path: "/guides/:id",
            method: "PATCH",
            fields: guideFields,
            map: { ...version, visibilityDepartment: "visibility_department" },
            build: guideBuild,
          },
          { label: "Versiones", path: "/guides/:id/revisions", read: true },
          {
            label: "Restaurar versión",
            path: "/guides/:id/restore",
            fields: [
              f("restoreVersion", "Versión a restaurar", "number", { min: 1 }),
            ],
            map: version,
            confirm: true,
          },
          {
            label: "Archivar",
            path: "/guides/:id/archive",
            map: version,
            confirm: true,
            when: (r) => r.lifecycle === "active",
          },
          {
            label: "Vincular hilo",
            path: "/guides/:id/link",
            fields: [f("threadId", "ID del hilo de guías")],
            map: version,
            confirm: true,
          },
          {
            label: "Publicar en Discord",
            path: "/guides/:id/publish",
            map: version,
            defaults: { confirm: true },
            confirm: true,
            when: (r) => r.lifecycle === "active" && !r.discord_thread_id,
          },
        ],
      },
    ],
  },
  {
    key: "github",
    label: "GitHub",
    description:
      "Desarrollo agrupado y releases oficiales con evidencia por SHA.",
    admin: true,
    tabs: [
      {
        key: "sources",
        label: "Repositorios",
        path: "/github/sources",
        paginated: false,
        columns: [
          "id",
          "repository",
          "enabled",
          "default_branch",
          "last_sync_at",
          "last_sync_error",
          "coverage_gap",
        ],
        create: {
          label: "Añadir repositorio",
          path: "/github/sources",
          fields: [
            f("repository", "Repositorio owner/name"),
            dep,
            f("defaultBranch", "Rama principal", "text", { value: "main" }),
          ],
        },
        actions: [
          {
            label: "Configurar",
            path: "/github/sources/:id",
            method: "PATCH",
            fields: [
              f("enabled", "Fuente habilitada", "checkbox"),
              f("pushEnabled", "Reportes de desarrollo", "checkbox"),
              f("releaseEnabled", "Releases oficiales", "checkbox"),
              f("batchMinutes", "Agrupación (minutos)", "number", {
                min: 5,
                max: 1440,
              }),
              f("defaultBranch", "Rama principal"),
              f("allowPrereleases", "Incluir prereleases", "checkbox"),
            ],
            map: {
              pushEnabled: "push_enabled",
              releaseEnabled: "release_enabled",
              batchMinutes: "batch_minutes",
              defaultBranch: "default_branch",
              allowPrereleases: "allow_prereleases",
            },
            confirm: true,
          },
          {
            label: "Sincronizar",
            path: "/github/sources/:id/sync",
            defaults: { commits: true, releases: true },
            confirm: true,
            when: (r) => !!r.enabled,
          },
          {
            label: "Reconocer brecha",
            path: "/github/sources/:id/coverage/acknowledge",
            fields: [{ ...reason, min: 20 }],
            confirm: true,
            when: (r) => !!r.coverage_gap,
          },
        ],
      },
      {
        key: "commits",
        label: "Commits de desarrollo",
        path: "/github/commits",
        columns: [
          "sha",
          "title",
          "author",
          "lifecycle",
          "report_id",
          "committed_at",
        ],
        requiredFilter: "repository",
        filters: [
          f("repository", "Repositorio owner/name"),
          opt("state", "Estado", [
            "detected",
            "assigned",
            "published",
            "needs_reconciliation",
            "cancelled",
            "legacy_unverified",
          ]),
        ],
      },
      {
        key: "releases",
        label: "Releases oficiales",
        path: "/github/releases",
        columns: [
          "repository",
          "release_id",
          "tag",
          "title",
          "relation_status",
          "verified_commits",
          "change_state",
          "published_at",
        ],
        filters: [
          f("repository", "Repositorio owner/name", "text", {
            required: false,
          }),
        ],
        actions: [
          {
            label: "SHAs verificados",
            path: "/github/releases/:release_id/commits?repository=:repository",
            read: true,
          },
        ],
      },
    ],
  },
  {
    key: "billing",
    label: "Finanzas",
    description: "Registros exactos. Cada moneda conserva su propio balance.",
    admin: true,
    tabs: [
      {
        key: "records",
        label: "Registros",
        path: "/billing",
        columns: [
          "id",
          "label",
          "amount_minor",
          "currency",
          "category",
          "status",
          "due_at",
          "version",
        ],
        filters: [
          ...commonSearch,
          f("currency", "Moneda", "text", { required: false }),
          f("category", "Categoría", "text", { required: false }),
          opt("status", "Estado", ["active", "archived", "void"]),
        ],
        create: {
          label: "Nuevo registro",
          path: "/billing",
          fields: recordFields,
          build: billingBuild,
        },
        actions: [
          {
            label: "Editar",
            path: "/billing/:id",
            method: "PATCH",
            fields: [...recordFields, reason],
            map: billingMap,
            build: billingBuild,
          },
          {
            label: "Historial",
            path: "/billing/history?kind=record&id=:id",
            read: true,
          },
        ],
      },
      {
        key: "subscriptions",
        label: "Suscripciones",
        path: "/billing/subscriptions",
        columns: [
          "id",
          "label",
          "provider",
          "amount_minor",
          "currency",
          "cadence_months",
          "status",
          "next_due_at",
          "version",
        ],
        filters: [
          f("currency", "Moneda", "text", { required: false }),
          opt("status", "Estado", ["active", "paused", "cancelled"]),
        ],
        create: {
          label: "Nueva suscripción",
          path: "/billing/subscriptions",
          fields: subscriptionFields,
          build: billingBuild,
        },
        actions: [
          {
            label: "Editar",
            path: "/billing/subscriptions/:id",
            method: "PATCH",
            fields: [...subscriptionFields, reason],
            map: billingMap,
            build: billingBuild,
          },
          {
            label: "Historial",
            path: "/billing/history?kind=subscription&id=:id",
            read: true,
          },
        ],
      },
      {
        key: "summary",
        label: "Resumen por moneda",
        path: "/billing/summary",
        itemsKey: "groups",
        paginated: false,
        columns: [
          "currency",
          "category",
          "status",
          "entries",
          "amount_minor_total",
        ],
      },
    ],
  },
  {
    key: "staff",
    label: "Equipo",
    description: "Asignaciones registradas y roles actuales de Discord.",
    admin: true,
    tabs: [
      {
        key: "directory",
        label: "Directorio parcial",
        path: "/staff/directory",
        paginated: false,
        columns: ["id", "member", "assignments"],
        actions: [
          { label: "Roles vigentes", path: "/staff/members/:id", read: true },
          {
            label: "Permisos efectivos",
            path: "/staff/members/:id/permissions",
            read: true,
          },
        ],
      },
      {
        key: "assignments",
        label: "Asignaciones",
        path: "/staff/assignments",
        paginated: false,
        columns: ["user_id", "department", "assigned_by", "assigned_at"],
        actions: [
          {
            label: "Retirar asignación",
            path: "/staff/assignments/:user_id/:department",
            method: "DELETE",
            fields: [reason],
            confirm: true,
          },
        ],
        create: {
          label: "Registrar asignación",
          path: "/staff/assignments",
          method: "PUT",
          fields: [f("userId", "ID del miembro"), dep],
          confirm: true,
        },
      },
    ],
  },
  {
    key: "automations",
    label: "Automatizaciones",
    description:
      "Acciones permitidas, ejecuciones trazables y avisos internos.",
    admin: true,
    tabs: [
      {
        key: "rules",
        label: "Reglas",
        path: "/automations",
        columns: [
          "id",
          "name",
          "kind",
          "enabled",
          "trigger_kind",
          "last_run_at",
          "last_result",
          "last_error",
        ],
        create: autoCreate,
        actions: [
          {
            ...autoCreate,
            label: "Editar",
            path: "/automations/:id",
            method: "PATCH",
            map: {
              ...version,
              triggerKind: "trigger_kind",
              intervalMinutes: "interval_minutes",
            },
            when: (r) => !r.enabled,
          },
          {
            label: "Habilitar",
            path: "/automations/:id/enable",
            map: version,
            defaults: { enabled: true },
            confirm: true,
            when: (r) => !r.enabled,
          },
          {
            label: "Deshabilitar",
            path: "/automations/:id/enable",
            map: version,
            defaults: { enabled: false },
            confirm: true,
            when: (r) => !!r.enabled,
          },
          {
            label: "Ejecutar",
            path: "/automations/:id/run",
            defaults: { confirm: true },
            confirm: true,
            when: (r) => !!r.enabled,
          },
          {
            label: "Ejecuciones",
            path: "/automations/:id/executions",
            read: true,
          },
        ],
      },
      {
        key: "notifications",
        label: "Notificaciones",
        path: "/automations/notifications",
        columns: ["id", "category", "message", "acknowledged_at", "created_at"],
        actions: [
          {
            label: "Marcar revisada",
            path: "/automations/notifications/:id/acknowledge",
            confirm: true,
            when: (r) => !r.acknowledged_at,
          },
        ],
      },
    ],
  },
  {
    key: "jobs",
    label: "Trabajos",
    description: "Colas, intentos y conciliación de publicaciones inciertas.",
    admin: true,
    tabs: [
      {
        key: "jobs",
        label: "Cola de trabajos",
        path: "/jobs",
        columns: [
          "id",
          "kind",
          "status",
          "origin",
          "attempts",
          "run_at",
          "last_error",
        ],
        filters: [
          opt("status", "Estado", [
            "queued",
            "running",
            "done",
            "failed",
            "needs_reconciliation",
            "cancelled",
          ]),
        ],
        actions: [
          { label: "Detalle e intentos", path: "/jobs/:id", read: true },
          {
            label: "Cancelar en cola",
            path: "/jobs/:id/cancel",
            fields: [reason],
            confirm: true,
            when: (r) => r.status === "queued",
          },
          {
            label: "Conciliar",
            path: "/jobs/:id/reconcile",
            fields: [
              opt("action", "Decisión", ["link", "retry", "cancel"]),
              f("channelId", "ID del canal (vincular)", "text", {
                required: false,
              }),
              f("messageId", "ID del mensaje (vincular)", "text", {
                required: false,
              }),
              f(
                "confirmRemoteAbsent",
                "He comprobado que no existe publicación remota (reintentar)",
                "checkbox",
              ),
              reason,
            ],
            confirm: true,
            when: (r) =>
              ["failed", "needs_reconciliation"].includes(String(r.status)),
            build: (v) =>
              v.action === "link"
                ? {
                    action: v.action,
                    channelId: v.channelId,
                    messageId: v.messageId,
                    reason: v.reason,
                  }
                : v.action === "retry"
                  ? {
                      action: v.action,
                      confirmRemoteAbsent: v.confirmRemoteAbsent,
                      reason: v.reason,
                    }
                  : { action: v.action, reason: v.reason },
          },
        ],
      },
    ],
  },
  {
    key: "audit",
    label: "Auditoría",
    description: "Cambios administrativos, snapshots y cobertura observada.",
    admin: true,
    tabs: [
      {
        key: "audit",
        label: "Actividad",
        path: "/audit",
        columns: [
          "id",
          "actor_id",
          "action",
          "target_kind",
          "target_id",
          "meta",
          "occurred_at",
        ],
      },
      {
        key: "snapshots",
        label: "Snapshots",
        path: "/auditor/snapshots",
        columns: [
          "id",
          "status",
          "completeness",
          "created_at",
          "finished_at",
          "error",
        ],
        create: {
          label: "Capturar snapshot",
          path: "/auditor/snapshots",
          fields: [
            f("includeArchived", "Incluir hilos archivados", "checkbox"),
            f("maxArchivedPerForum", "Máximo por foro", "number", {
              min: 10,
              max: 500,
              value: 100,
            }),
          ],
          confirm: true,
        },
        actions: [
          { label: "Ver snapshot", path: "/auditor/snapshots/:id", read: true },
          {
            label: "Comparar",
            path: "/auditor/snapshots/:id/compare?against=:against",
            fields: [
              f("against", "ID del otro snapshot", "number", { min: 1 }),
            ],
            read: true,
          },
        ],
      },
      {
        key: "coverage",
        label: "Cobertura del índice",
        path: "/report-index/coverage",
        paginated: false,
        columns: [
          "id",
          "department",
          "enabled",
          "indexed_reports",
          "unavailable_bodies",
          "last_indexed_at",
          "last_import",
        ],
      },
      {
        key: "sources",
        label: "Fuentes del índice",
        path: "/report-index/sources",
        paginated: false,
        columns: [
          "id",
          "department",
          "channel_id",
          "enabled",
          "capture_content",
          "historical_enabled",
        ],
        actions: [
          {
            label: "Configurar",
            path: "/report-index/sources/:id",
            method: "PATCH",
            fields: [
              f("enabled", "Habilitada", "checkbox"),
              f(
                "captureContent",
                "Capturar contenido (requiere intent)",
                "checkbox",
              ),
              f("historicalEnabled", "Permitir histórico", "checkbox"),
            ],
            map: {
              captureContent: "capture_content",
              historicalEnabled: "historical_enabled",
            },
            confirm: true,
          },
        ],
      },
      {
        key: "imports",
        tools: [
          {
            label: "Recuperar importaciones huérfanas",
            path: "/report-index/imports/recover",
            confirm: true,
          },
        ],
        label: "Importaciones",
        path: "/report-index/imports",
        columns: [
          "id",
          "source_id",
          "status",
          "dry_run",
          "processed",
          "errors",
          "coverage",
        ],
        create: {
          label: "Iniciar importación",
          path: "/report-index/imports",
          fields: [
            f("sourceId", "ID de fuente habilitada", "number", { min: 1 }),
            f("dryRun", "Simulación sin guardar reportes", "checkbox", {
              value: true,
            }),
          ],
          confirm: true,
        },
        actions: [
          { label: "Detalle", path: "/report-index/imports/:id", read: true },
          {
            label: "Pausar",
            path: "/report-index/imports/:id/pause",
            confirm: true,
            when: (r) => ["queued", "running"].includes(String(r.status)),
          },
          {
            label: "Reanudar",
            path: "/report-index/imports/:id/resume",
            confirm: true,
            when: (r) => ["paused", "failed"].includes(String(r.status)),
          },
          {
            label: "Cancelar",
            path: "/report-index/imports/:id/cancel",
            confirm: true,
            when: (r) =>
              ["queued", "running", "paused"].includes(String(r.status)),
          },
        ],
      },
      {
        key: "diagnostics",
        label: "Diagnóstico",
        path: "/diagnostics",
        columns: [],
        paginated: false,
        detailView: true,
      },
    ],
  },
  {
    key: "settings",
    label: "Configuración",
    description: "Haz que Studio se adapte a tu forma de trabajar.",
  },
];
export function actionPath(action: Action, row: Row, values: Row = {}): string {
  return action.path.replace(/:([A-Za-z_]+)/g, (_, key: string) =>
    encodeURIComponent(String(values[key] ?? row[key] ?? "")),
  );
}
export function initialValues(
  action: Action,
  row: Row = {},
  session?: Session,
): Row {
  const result: Row = { ...action.defaults };
  for (const field of action.fields ?? []) {
    const key = action.map?.[field.key] ?? field.key;
    result[field.key] =
      row[key] ??
      field.value ??
      (field.type === "checkbox"
        ? false
        : field.type === "visual"
          ? { embeds: [] }
          : field.type === "select"
            ? (field.options?.[0] ?? "")
            : "");
  }
  for (const [key, source] of Object.entries(action.map ?? {}))
    if (row[source] !== undefined) result[key] = row[source];
  if (row.config && typeof row.config === "object")
    Object.assign(result, row.config);
  if (
    session &&
    result.department &&
    !session.departments.includes(
      result.department as Session["departments"][number],
    )
  )
    result.department = session.departments[0] ?? "";
  return result;
}
export const columnLabels: Record<string, string> = {
  id: "ID",
  title: "Título",
  label: "Concepto",
  department: "Departamento",
  project: "Proyecto",
  source: "Origen",
  publication_status: "Publicación",
  occurred_at: "Fecha",
  status: "Estado",
  version: "Versión",
  scheduled_at: "Programado",
  published_at: "Publicado",
  enabled: "Habilitado",
  name: "Nombre",
  category: "Categoría",
  visibility_department: "Visibilidad",
  lifecycle: "Ciclo",
  discord_sync_state: "Discord",
  updated_at: "Actualizado",
  repository: "Repositorio",
  default_branch: "Rama",
  last_sync_at: "Sincronizado",
  last_sync_error: "Error de sincronización",
  coverage_gap: "Brecha de cobertura",
  sha: "SHA",
  author: "Autor",
  lifecycle_state: "Ciclo",
  report_id: "Reporte",
  committed_at: "Commit",
  release_id: "Release",
  tag: "Tag",
  relation_status: "Procedencia",
  verified_commits: "SHAs verificados",
  change_state: "Cambios",
  amount_minor: "Unidades menores",
  amount_minor_total: "Total en unidades menores",
  currency: "Moneda",
  due_at: "Vencimiento",
  provider: "Proveedor",
  cadence_months: "Meses",
  next_due_at: "Próximo vencimiento",
  entries: "Registros",
  member: "Miembro Discord",
  assignments: "Asignaciones",
  user_id: "Miembro",
  assigned_by: "Asignado por",
  assigned_at: "Registrado",
  kind: "Tipo",
  trigger_kind: "Activación",
  last_run_at: "Última ejecución",
  last_result: "Resultado",
  last_error: "Último error",
  message: "Mensaje",
  acknowledged_at: "Revisado",
  created_at: "Creado",
  origin: "Origen",
  attempts: "Intentos",
  run_at: "Ejecución",
  actor_id: "Autor",
  action: "Acción",
  target_kind: "Recurso",
  target_id: "ID recurso",
  meta: "Detalle",
  completeness: "Cobertura",
  finished_at: "Finalizado",
  error: "Error",
  channel_id: "Canal",
  indexed_reports: "Reportes guardados",
  unavailable_bodies: "Cuerpos no disponibles",
  last_indexed_at: "Última captura",
  last_import: "Última importación",
  capture_content: "Contenido",
  historical_enabled: "Histórico",
  source_id: "Fuente",
  dry_run: "Simulación",
  processed: "Procesados",
  errors: "Errores",
  coverage: "Cobertura",
};
