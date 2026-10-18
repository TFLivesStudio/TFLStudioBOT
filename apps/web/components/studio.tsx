"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useId } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Boxes,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
  Zap,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  preferencesSchema,
  reportSchema,
  visualSchema,
  type Preferences,
  type Session,
} from "@tfl/shared";
import {
  sections,
  actionPath,
  initialValues,
  columnLabels,
  type Action,
  type Field,
  type Row,
  type Tab,
} from "@/lib/modules";
import { api } from "@/lib/api";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";
import dynamic from "next/dynamic";
const EmbedEditor = dynamic(
  () => import("./embed-editor").then((m) => m.EmbedEditor),
  { loading: () => <p>Preparando editor…</p> },
);
const icons: Record<string, LucideIcon> = {
  overview: LayoutDashboard,
  reports: FileText,
  announcements: Bell,
  guides: BookOpen,
  github: GitBranch,
  billing: Wallet,
  staff: Users,
  automations: Zap,
  jobs: Workflow,
  audit: ShieldCheck,
  settings: Settings2,
};
function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "")
    return "No disponible";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function dateText(value: unknown) {
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf())
    ? valueText(value)
    : new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}
function Cell({ name, value }: { name: string; value: unknown }) {
  if (name.endsWith("_at"))
    return (
      <span className="date">{value ? dateText(value) : "Sin registro"}</span>
    );
  if (
    [
      "status",
      "publication_status",
      "lifecycle",
      "discord_sync_state",
      "relation_status",
      "enabled",
    ].includes(name)
  )
    return <span className={"badge " + String(value)}>{valueText(value)}</span>;
  if (name === "sha")
    return <code title={String(value)}>{String(value).slice(0, 9)}</code>;
  return (
    <span
      className={
        ["title", "label", "name", "repository"].includes(name)
          ? "cell-title"
          : ""
      }
      title={valueText(value)}
    >
      {valueText(value)}
    </span>
  );
}
function DataView({ data }: { data: unknown }) {
  if (data === null || data === undefined)
    return <p className="muted">No disponible.</p>;
  if (Array.isArray(data))
    return (
      <div className="detail-list">
        {data.length ? (
          data.map((item, i) => (
            <article key={i}>
              <DataView data={item} />
            </article>
          ))
        ) : (
          <p>Sin registros.</p>
        )}
      </div>
    );
  if (typeof data === "object")
    return (
      <dl className="detail-grid">
        {Object.entries(data).map(([key, value]) => (
          <div key={key}>
            <dt>{columnLabels[key] ?? key}</dt>
            <dd>
              {typeof value === "object" && value !== null ? (
                <DataView data={value} />
              ) : key === "body" ||
                key === "description" ||
                key === "official_notes" ? (
                <p className="prose">{String(value ?? "")}</p>
              ) : key === "discordUrl" &&
                typeof value === "string" &&
                value.startsWith("https://discord.com/channels/") ? (
                <a href={value} target="_blank" rel="noreferrer">
                  Abrir en Discord ↗
                </a>
              ) : (
                valueText(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    );
  return <p className="prose">{valueText(data)}</p>;
}
function usePreferences() {
  const [prefs, setPrefs] = useState<Preferences>(() =>
    preferencesSchema.parse({}),
  );
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setPrefs(
        preferencesSchema.parse(
          JSON.parse(localStorage.getItem("tfl-studio-preferences") ?? "{}"),
        ),
      );
    } catch {
      /* Invalid local values reset to schema defaults. */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("tfl-studio-preferences", JSON.stringify(prefs));
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : prefs.theme;
      document.documentElement.dataset.accent = prefs.accent;
      document.documentElement.dataset.density = prefs.density;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs, ready]);
  return [prefs, setPrefs] as const;
}
export function Studio({
  section,
  session,
  initialSearch = "",
  initialTab = "",
}: {
  section: string;
  session: Session;
  initialSearch?: string;
  initialTab?: string;
}) {
  const [prefs, setPrefs] = usePreferences();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const current = sections.find((s) => s.key === section) ?? sections[0]!;
  const [toast, setToast] = useState("");
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5500);
    return () => clearTimeout(timer);
  }, [toast]);
  const allowed = sections.filter((s) => !s.admin || session.admin);
  async function logout() {
    try {
      await api("/auth/logout", {
        method: "POST",
        body: {},
        csrf: session.csrfToken,
      });
      window.location.assign("/login");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  return (
    <div
      className={
        "studio " +
        (prefs.collapsed ? "collapsed " : "") +
        (mobile ? "mobile-open" : "")
      }
    >
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Boxes size={23} />
          </span>
          <span>
            TFL<span className="brand-light">STUDIO</span>
            <small>WORKSPACE / 01</small>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-icon">T</span>
          <div>
            TFL Network<small>Espacio de operaciones</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Navegación principal">
          {allowed
            .filter((s) => s.key !== "settings")
            .map((s) => {
              const Icon = icons[s.key]!;
              return (
                <Link
                  key={s.key}
                  href={s.key === "overview" ? "/" : "/" + s.key}
                  aria-current={section === s.key ? "page" : undefined}
                  onClick={() => setMobile(false)}
                >
                  <Icon size={18} />
                  <span>{s.label}</span>
                  {s.key === "overview" && <span className="nav-dash">—</span>}
                </Link>
              );
            })}
        </nav>
        <div className="sidebar-bottom">
          <p className="nav-label">PREFERENCIAS</p>
          <Link href="/settings">
            <Settings2 size={18} />
            <span>Configuración</span>
          </Link>
          <div className="access-note">
            <ShieldCheck size={17} />
            <span>
              Acceso verificado<small>Permisos vigentes de Discord</small>
            </span>
          </div>
          <button className="account" onClick={() => void logout()}>
            <span className="avatar">{session.admin ? "A" : "T"}</span>
            <span>
              {session.admin ? "Administrador" : "Equipo TFL"}
              <small>{session.userId}</small>
            </span>
            <LogOut size={16} />
          </button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button desktop-toggle"
              aria-label="Contraer menú"
              onClick={() =>
                setPrefs({ ...prefs, collapsed: !prefs.collapsed })
              }
            >
              <Menu size={19} />
            </button>
            <button
              className="icon-button mobile-toggle"
              aria-label="Abrir menú"
              onClick={() => setMobile(!mobile)}
            >
              <Menu size={19} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{current.label}</strong>
          </div>
          <div className="top-actions">
            <div className="global-search">
              <Search size={16} />
              <input
                aria-label="Buscar módulo"
                placeholder="Buscar en Studio…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <div className="search-results">
                  {allowed
                    .filter((s) =>
                      (s.label + " " + s.description)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((s) => (
                      <Link
                        key={s.key}
                        href={s.key === "overview" ? "/" : "/" + s.key}
                      >
                        {s.label}
                        <ArrowUpRight size={14} />
                      </Link>
                    ))}
                  <Link href={"/reports?search=" + encodeURIComponent(search)}>
                    Buscar «{search}» en reportes <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="Cambiar tema"
              onClick={() =>
                setPrefs({
                  ...prefs,
                  theme:
                    document.documentElement.dataset.theme === "dark"
                      ? "light"
                      : "dark",
                })
              }
            >
              <Moon size={18} />
            </button>
            {session.admin && (
              <Link
                href="/automations?tab=notifications"
                aria-label="Notificaciones"
                className="icon-button"
              >
                <Bell size={18} />
              </Link>
            )}
            <span className="top-avatar">TF</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                TFL STUDIO <span>/</span>{" "}
                {section === "overview" ? "CENTRO DE OPERACIONES" : "WORKSPACE"}
              </p>
              <h1>
                {current.label}
                <span className="heading-dot">.</span>
              </h1>
              <p>{current.description}</p>
            </div>
            <span className="private-badge">
              <ShieldCheck size={13} /> Espacio privado
            </span>
          </div>
          {section === "overview" ? (
            <Overview session={session} notifications={prefs.notifications} />
          ) : section === "settings" ? (
            <PreferencesPanel prefs={prefs} onChange={setPrefs} />
          ) : (
            <Module
              initialSearch={initialSearch}
              initialTab={initialTab}
              key={section}
              section={section}
              session={session}
              notify={setToast}
            />
          )}
          <footer className="page-footer">
            <span>
              TFL STUDIO <b>CORE</b>
            </span>
            <span>Tu equipo. Todo conectado.</span>
            <span>
              v0.4.0 <span className="tiny-dot" />
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
function Overview({
  session,
  notifications,
}: {
  session: Session;
  notifications: boolean;
}) {
  const [data, setData] = useState<{
    stats: Row | null;
    reports: Row[];
    diagnostics: Row | null;
    audit: Row[];
    errors: string[];
  } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    const request = (path: string) => api<Row>(path, { signal: abort.signal });
    void Promise.allSettled([
      request("/stats"),
      request("/reports?limit=5"),
      ...(session.admin
        ? [request("/diagnostics"), request("/audit?limit=5")]
        : []),
    ]).then((results) => {
      if (abort.signal.aborted) return;
      const val = (i: number) =>
        results[i]?.status === "fulfilled" ? (results[i].value as Row) : null;
      setData({
        stats: val(0),
        reports: (val(1)?.items ?? []) as Row[],
        diagnostics: val(2),
        audit: (val(3)?.items ?? []) as Row[],
        errors: results.flatMap((r) =>
          r.status === "rejected" ? [String((r.reason as Error).message)] : [],
        ),
      });
    });
    return () => abort.abort();
  }, [session.admin, revision]);
  const d = data?.diagnostics;
  const stats = data?.stats;
  const departments = stats?.departments as Row[] | undefined;
  const jobs = d?.jobs as Row[] | undefined;
  const heartbeats = d?.heartbeats as Row[] | undefined;
  const worker = heartbeats?.find((h) => h.component === "jobs");
  const metrics = [
    {
      title: "Reportes registrados",
      value: departments
        ? departments.reduce((n, r) => n + Number(r.total), 0)
        : null,
      foot: "En tus departamentos autorizados",
      Icon: FileText,
    },
    {
      title: "Trabajos pendientes",
      value: jobs
        ? jobs
            .filter((r) => r.status === "queued")
            .reduce((n, r) => n + Number(r.total), 0)
        : null,
      foot: "Cola persistente del Core",
      Icon: Workflow,
    },
    {
      title: "Conexión con Discord",
      value: d
        ? (d.gateway as Row)?.ready
          ? "Conectado"
          : "Desconectado"
        : null,
      foot: "Estado actual del Gateway",
      Icon: Activity,
    },
    {
      title: "Worker",
      value: worker?.fresh ? valueText(worker.state) : null,
      foot: worker?.fresh
        ? "Heartbeat reciente"
        : "Sin heartbeat reciente verificado",
      Icon: Zap,
    },
  ];
  return (
    <>
      <section className="welcome-banner">
        <div>
          <span className="banner-tag">
            <span className="tiny-dot" /> TU CENTRO DE OPERACIONES
          </span>
          <h2>
            Todo listo para seguir
            <br />
            construyendo.
          </h2>
          <p>
            Coordina avances, revisa el estado del Core
            <br />y mantén a tu equipo en la misma página.
          </p>
          <Link href="/reports" className="banner-link">
            Ver reportes <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="banner-visual" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="floating-tile">
            <Boxes size={65} strokeWidth={1} />
          </div>
          <span className="visual-label">TFL / CONNECTED WORKSPACE</span>
          <span className="cross cross-one">+</span>
          <span className="cross cross-two">+</span>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <h2>Estado de operaciones</h2>
          <p>Datos observados del Core y tus departamentos.</p>
        </div>
        <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
          <RefreshCw size={14} /> Actualizar
        </Button>
      </div>
      {data?.errors.length ? (
        <div className="notice" role="alert">
          Algunos datos no están disponibles.{" "}
          {Array.from(new Set(data.errors)).join(" ")}
        </div>
      ) : null}
      <div className="metrics">
        {metrics.map((m) => (
          <article className="metric" key={m.title}>
            <div>
              <span>{m.title}</span>
              <m.Icon size={17} />
            </div>
            {!data ? (
              <div className="skeleton" />
            ) : (
              <strong>{m.value ?? "No disponible"}</strong>
            )}
            <small>{m.foot}</small>
          </article>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Reportes recientes</h2>
              <p>Últimos avances guardados</p>
            </div>
            <Link href="/reports">
              Ver todos <ArrowUpRight size={14} />
            </Link>
          </div>
          {!data ? (
            <LoadingRows />
          ) : data.reports.length ? (
            <div className="report-list">
              {data.reports.map((r) => (
                <Link
                  href={
                    "/reports?search=" + encodeURIComponent(String(r.title))
                  }
                  key={String(r.id)}
                >
                  <span className="list-icon">
                    <FileText size={18} />
                  </span>
                  <div>
                    <strong>{String(r.title)}</strong>
                    <small>
                      {String(r.department)} <span>·</span>{" "}
                      {dateText(r.occurred_at)}
                    </small>
                  </div>
                  <span className={"badge " + String(r.publication_status)}>
                    {String(r.publication_status)}
                  </span>
                  <ChevronRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <Empty
              title="Tu próximo avance empieza aquí"
              text="Los reportes aparecerán cuando el equipo los registre."
            />
          )}
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <h2>Accesos rápidos</h2>
              <p>Lo que necesitas, más cerca</p>
            </div>
            <Sparkles size={18} />
          </div>
          {[
            {
              href: "/reports",
              label: "Registrar un avance",
              desc: "Comparte el progreso del equipo",
              Icon: FileText,
            },
            {
              href: "/guides",
              label: "Consultar las guías",
              desc: "Conocimiento para seguir avanzando",
              Icon: BookOpen,
            },
            ...(session.admin
              ? [
                  {
                    href: "/jobs",
                    label: "Revisar los trabajos",
                    desc: "Colas, errores y conciliación",
                    Icon: Workflow,
                  },
                ]
              : []),
          ].map((item) => (
            <Link className="quick-link" href={item.href} key={item.href}>
              <span className="list-icon">
                <item.Icon size={17} />
              </span>
              <div>
                <strong>{item.label}</strong>
                <small>{item.desc}</small>
              </div>
              <ArrowUpRight size={16} />
            </Link>
          ))}
          <div className="help-note">
            <CircleHelp size={17} />
            <p>Los permisos se verifican con Discord en cada operación.</p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Actividad administrativa</h2>
              <p>Acciones registradas, con trazabilidad</p>
            </div>
            <Clock3 size={17} />
          </div>
          {data?.audit.length ? (
            <div className="timeline">
              {data.audit.map((r) => (
                <div key={String(r.id)}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{String(r.action)}</strong>
                    <small>
                      {String(r.target_kind)} #{String(r.target_id)} ·{" "}
                      {dateText(r.occurred_at)}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title={
                session.admin
                  ? "Sin actividad disponible"
                  : "Acceso departamental"
              }
              text={
                session.admin
                  ? "Las acciones administrativas se mostrarán aquí."
                  : "El historial global está reservado a ADMIN."
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Salud del sistema</h2>
              <p>Disponibilidad verificada</p>
            </div>
            <Activity size={18} />
          </div>
          <div className="health-list">
            <div>
              <span>PostgreSQL</span>
              <strong>
                {d
                  ? (d.postgresql as Row)?.reachable
                    ? "Disponible"
                    : "No disponible"
                  : "No disponible"}
              </strong>
            </div>
            <div>
              <span>Latencia PostgreSQL</span>
              <strong>
                {d
                  ? String((d.postgresql as Row)?.latencyMs) + " ms"
                  : "No disponible"}
              </strong>
            </div>
            <div>
              <span>Integraciones GitHub</span>
              <strong>
                {d
                  ? String(
                      (d.github as Row[]).filter((s) => s.enabled).length,
                    ) + " habilitadas"
                  : "No disponible"}
              </strong>
            </div>
            <div>
              <span>Incidencias de jobs</span>
              <strong>
                {d ? String((d.recentErrors as Row[]).length) : "No disponible"}
              </strong>
            </div>
          </div>
          {notifications && d && (d.recentErrors as Row[]).length > 0 && (
            <Link className="inline-alert" href="/jobs">
              Hay trabajos que requieren revisión <ArrowRight size={15} />
            </Link>
          )}
          <p className="coverage-note">
            Las cifras reflejan datos almacenados. La cobertura histórica de
            Discord puede ser parcial.
          </p>
        </section>
      </div>
    </>
  );
}
function LoadingRows() {
  return (
    <div className="loading-rows" aria-label="Cargando datos" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Boxes size={25} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Module({
  section,
  session,
  notify,
  initialSearch,
  initialTab,
}: {
  section: string;
  session: Session;
  notify: (text: string) => void;
  initialSearch: string;
  initialTab: string;
}) {
  const definition = sections.find((s) => s.key === section)!;
  const tabs = definition.tabs!.filter(
    (t) =>
      t.key !== "publications" ||
      session.admin ||
      session.departments.includes("publicidad"),
  );
  const [active, setActive] = useState(() =>
    Math.max(
      0,
      tabs.findIndex((tab) => tab.key === initialTab),
    ),
  );
  const tab = tabs[active]!;
  return (
    <>
      <div
        className="module-tabs"
        role="tablist"
        aria-label="Vistas del módulo"
      >
        {tabs.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <Resource
        initialSearch={initialSearch}
        key={tab.key}
        tab={tab}
        session={session}
        section={section}
        notify={notify}
      />
    </>
  );
}
function Resource({
  tab,
  session,
  section,
  notify,
  initialSearch,
}: {
  tab: Tab;
  session: Session;
  section: string;
  notify: (text: string) => void;
  initialSearch: string;
}) {
  const [filters, setFilters] = useState<Row>(() =>
    section === "reports" && tab.key === "reports" && initialSearch
      ? { search: initialSearch }
      : {},
  );
  const [applied, setApplied] = useState<Row>(filters);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Row | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<{ action: Action; row: Row } | null>(
    null,
  );
  const [detail, setDetail] = useState<{ label: string; data: unknown } | null>(
    null,
  );
  const [columns, setColumns] = useState<string[]>(tab.columns);
  useEffect(() => {
    try {
      const stored = JSON.parse(
        localStorage.getItem("tfl-columns-v1-" + section + "-" + tab.key) ??
          "null",
      ) as unknown;
      if (
        Array.isArray(stored) &&
        stored.every((k) => tab.columns.includes(String(k))) &&
        stored.length
      )
        setColumns(stored as string[]);
    } catch {
      /* invalid preferences use visible defaults */
    }
  }, [tab, section]);
  const missing = tab.requiredFilter && !applied[tab.requiredFilter];
  useEffect(() => {
    if (missing) {
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(applied))
      if (value !== "" && value !== null && value !== undefined)
        params.set(key, String(value));
    if (tab.paginated !== false) {
      params.set("limit", "25");
      params.set("offset", String(offset));
    }
    setLoading(true);
    setError("");
    void api<Row>(tab.path + (params.size ? "?" + params.toString() : ""), {
      signal: abort.signal,
    })
      .then((result) => {
        if (!abort.signal.aborted) setData(result);
      })
      .catch((e) => {
        if (!abort.signal.aborted) {
          setError((e as Error).message);
          setData(null);
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [applied, missing, offset, revision, tab]);
  const rows = (data?.[tab.itemsKey ?? "items"] ?? []) as Row[];
  const actions = (row: Row) =>
    (tab.actions ?? []).filter(
      (a) =>
        (session.admin || section === "reports" || a.label === "Leer guía") &&
        (!a.when || a.when(row)),
    );
  const create =
    tab.create && (session.admin || section === "reports") ? tab.create : null;
  function open(action: Action, row: Row) {
    if (action.read && !action.fields?.length) {
      void api(actionPath(action, row))
        .then((data) => setDetail({ label: action.label, data }))
        .catch((e) => notify((e as Error).message));
      return;
    }
    setSelected({ action, row });
  }
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(applied)) if (v) query.set(k, String(v));
  query.set("offset", String(offset));
  query.set("limit", "25");
  query.set("format", "csv");
  return (
    <section className="panel resource">
      <div className="resource-heading">
        <div>
          <h2>{tab.label}</h2>
          <p>
            {missing
              ? "Selecciona un repositorio para consultar sus commits."
              : `${data ? rows.length : "—"} registros en esta página · fuente: Core`}
          </p>
        </div>
        <div className="toolbar">
          {session.admin && section === "reports" && tab.key === "reports" && (
            <a
              className="outline"
              href={"/api/v1/reports/export?" + query.toString()}
            >
              <ArrowDownToLine size={15} /> Exportar página
            </a>
          )}
          {session.admin && section === "billing" && (
            <Button
              variant="outline"
              disabled={!data}
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob(
                    [
                      JSON.stringify(
                        { items: rows, offset, basis: "current_page_only" },
                        null,
                        2,
                      ),
                    ],
                    { type: "application/json" },
                  ),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "tfl-studio-finanzas-pagina.json";
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <ArrowDownToLine size={15} /> Exportar página JSON
            </Button>
          )}
          {session.admin && tab.key === "snapshots" && (
            <span className="muted">Descargas en cada snapshot</span>
          )}
          <Button
            variant="outline"
            aria-label="Actualizar datos"
            onClick={() => setRevision((r) => r + 1)}
          >
            <RefreshCw size={15} />
          </Button>
          {session.admin &&
            tab.tools?.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                onClick={() => setSelected({ action, row: {} })}
              >
                {action.label}
              </Button>
            ))}
          {create && (
            <Button onClick={() => setSelected({ action: create, row: {} })}>
              <Plus size={16} />
              {create.label}
            </Button>
          )}
        </div>
      </div>
      {tab.filters?.length && (
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            const normalized: Row = {};
            for (const [key, value] of Object.entries(filters)) {
              const field = tab.filters?.find((f) => f.key === key);
              normalized[key] =
                field?.type === "datetime-local" && value
                  ? new Date(String(value)).toISOString()
                  : value;
            }
            setApplied(normalized);
            setOffset(0);
          }}
        >
          <span className="filter-label">
            <SlidersHorizontal size={15} /> Filtros
          </span>
          {tab.filters.map((field) => (
            <Input
              key={field.key}
              field={{ ...field, required: field.key === tab.requiredFilter }}
              value={filters[field.key] ?? ""}
              onChange={(v) => setFilters({ ...filters, [field.key]: v })}
              filter
            />
          ))}
          <Button variant="outline" type="submit">
            Aplicar
          </Button>
          <button
            className="ghost"
            type="button"
            onClick={() => {
              setFilters({});
              setApplied({});
              setOffset(0);
            }}
          >
            Limpiar
          </button>
        </form>
      )}
      <details className="column-preferences">
        <summary>Columnas visibles</summary>
        <div className="column-options">
          {tab.columns.map((c) => (
            <label className="check" key={c}>
              <input
                type="checkbox"
                checked={columns.includes(c)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? tab.columns.filter((x) => x === c || columns.includes(x))
                    : columns.filter((x) => x !== c);
                  if (!next.length) return;
                  setColumns(next);
                  localStorage.setItem(
                    "tfl-columns-v1-" + section + "-" + tab.key,
                    JSON.stringify(next),
                  );
                }}
              />
              {columnLabels[c] ?? c}
            </label>
          ))}
        </div>
      </details>
      {error ? (
        <div className="error-state" role="alert">
          <h3>No se pudieron cargar los datos</h3>
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRevision((r) => r + 1)}>
            Reintentar
          </Button>
        </div>
      ) : loading ? (
        <LoadingRows />
      ) : missing ? (
        <Empty
          title="Elige un repositorio"
          text="Escribe owner/name en el filtro para ver el ciclo de sus commits."
        />
      ) : tab.detailView ? (
        <div className="diagnostic-detail">
          <DataView data={data} />
        </div>
      ) : rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c} scope="col">
                    {columnLabels[c] ?? c}
                  </th>
                ))}
                <th scope="col">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={String(row.id ?? row.sha ?? row.release_id ?? i)}>
                  {columns.map((c) => (
                    <td key={c}>
                      <Cell name={c} value={row[c]} />
                    </td>
                  ))}
                  <td>
                    <details className="row-menu">
                      <summary
                        aria-label={
                          "Acciones de " +
                          String(
                            row.title ?? row.label ?? row.name ?? row.id ?? i,
                          )
                        }
                      >
                        •••
                      </summary>
                      <div>
                        {actions(row).map((action) => (
                          <button
                            key={action.label}
                            onClick={(e) => {
                              e.currentTarget
                                .closest("details")
                                ?.removeAttribute("open");
                              open(action, row);
                            }}
                          >
                            {action.label}
                          </button>
                        ))}
                        <button
                          onClick={() =>
                            setDetail({
                              label: "Detalle del registro",
                              data: row,
                            })
                          }
                        >
                          Ver datos
                        </button>
                        {tab.key === "snapshots" && row.status === "done" && (
                          <>
                            <a
                              href={
                                "/api/v1/auditor/snapshots/" +
                                row.id +
                                "/download?format=json"
                              }
                            >
                              Descargar JSON
                            </a>
                            <a
                              href={
                                "/api/v1/auditor/snapshots/" +
                                row.id +
                                "/download?format=md"
                              }
                            >
                              Descargar Markdown
                            </a>
                          </>
                        )}
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          title="Todo despejado por aquí"
          text="No hay registros para los filtros actuales. Puedes ajustar la búsqueda o crear un registro autorizado."
        />
      )}
      <div className="table-footer">
        <span>
          {section === "staff"
            ? "Directorio parcial: solo asignaciones registradas. No concede roles de Discord."
            : section === "billing"
              ? "Importes exactos en unidades menores. Sin conversión de monedas."
              : "Cobertura de registros almacenados; puede ser parcial."}
        </span>
        {tab.paginated !== false && (
          <div>
            <button
              className="icon-button"
              aria-label="Página anterior"
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - 25))}
            >
              <ChevronLeft size={17} />
            </button>
            <span>Página {offset / 25 + 1}</span>
            <button
              className="icon-button"
              aria-label="Página siguiente"
              disabled={rows.length < 25 || loading}
              onClick={() => setOffset(offset + 25)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>
      {selected && (
        <ActionForm
          key={selected.action.path + String(selected.row.id ?? "new")}
          action={selected.action}
          row={selected.row}
          session={session}
          onClose={() => setSelected(null)}
          onSuccess={(result) => {
            setSelected(null);
            if (selected.action.read)
              setDetail({ label: selected.action.label, data: result });
            else {
              setRevision((r) => r + 1);
              notify(
                "Operación guardada. El estado remoto se actualiza al procesarse el trabajo.",
              );
            }
          }}
        />
      )}
      <Modal
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={detail?.label ?? "Detalle"}
        description="Datos devueltos por la API. Los campos ausentes no equivalen a cero."
      >
        <DataView data={detail?.data} />
      </Modal>
    </section>
  );
}
function Input({
  field,
  value,
  onChange,
  filter = false,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  filter?: boolean;
}) {
  const id = useId();
  if (field.type === "visual")
    return (
      <div className="full-width">
        <EmbedEditor value={value} onChange={onChange} />
      </div>
    );
  if (field.type === "checkbox")
    return (
      <label className="check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  let display = String(value ?? "");
  if (field.type === "datetime-local" && display && display.endsWith("Z")) {
    const date = new Date(display);
    display = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  }
  const props = {
    id,
    value: display,
    required: field.required ?? false,
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      onChange(
        field.type === "number"
          ? e.target.value === ""
            ? ""
            : Number(e.target.value)
          : e.target.value,
      ),
  };
  return (
    <label
      className={field.type === "textarea" ? "full-width" : ""}
      htmlFor={id}
    >
      {field.label}
      {field.type === "select" ? (
        <select {...props}>
          {(filter || (!field.required && !field.options?.includes(""))) && (
            <option value="">{filter ? "Todos" : "Sin selección"}</option>
          )}
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o || "Equipo completo"}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          {...props}
          minLength={field.min}
          maxLength={field.max}
          rows={5}
        />
      ) : (
        <input
          {...props}
          type={field.type ?? "text"}
          {...(field.type === "number"
            ? { min: field.min, max: field.max, step: 1 }
            : { minLength: field.min, maxLength: field.max })}
        />
      )}{" "}
      {field.help && <small>{field.help}</small>}
    </label>
  );
}
function ActionForm({
  action,
  row,
  session,
  onClose,
  onSuccess,
}: {
  action: Action;
  row: Row;
  session: Session;
  onClose: () => void;
  onSuccess: (result: unknown) => void;
}) {
  const [values, setValues] = useState<Row>(() =>
    initialValues(action, row, session),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const key = useRef(crypto.randomUUID());
  const [templates, setTemplates] = useState<Row[]>([]);
  useEffect(() => {
    if (!["/announcements", "/announcements/:id"].includes(action.path)) return;
    const abort = new AbortController();
    void api<{ items: Row[] }>("/announcements/templates", {
      signal: abort.signal,
    })
      .then((r) => setTemplates(r.items.filter((t) => t.enabled)))
      .catch(() => {});
    return () => abort.abort();
  }, [action.path]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      let data: Row = { ...values };
      for (const field of action.fields ?? []) {
        if (field.type === "datetime-local")
          data[field.key] = values[field.key]
            ? new Date(String(values[field.key])).toISOString()
            : null;
        if (field.type === "number") {
          const value = values[field.key];
          if (value === "" || value === null || value === undefined)
            data[field.key] = null;
          else {
            const number = Number(value);
            if (!Number.isSafeInteger(number))
              throw new Error(
                field.label + ": utiliza un entero dentro del rango seguro.",
              );
            data[field.key] = number;
          }
        }
      }
      data = action.build?.(data, row) ?? data;
      if (data.visual) data.visual = visualSchema.parse(data.visual);
      if (action.path === "/reports") data = reportSchema.parse(data);
      const result = await api(
        actionPath(action, row, data),
        action.read
          ? {}
          : {
              method: action.method ?? "POST",
              body: data,
              csrf: session.csrfToken,
              key: key.current,
            },
      );
      onSuccess(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const fields = (action.fields ?? []).map((field) =>
    field.key === "department" && !session.admin
      ? { ...field, options: session.departments }
      : field,
  );
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={action.label}
      description={
        action.confirm
          ? "Revisa los datos antes de confirmar. La acción se valida nuevamente en Core."
          : "Los cambios se validan con tus permisos actuales de Discord."
      }
    >
      <form onSubmit={(e) => void submit(e)}>
        {templates.length > 0 && (
          <label className="template-picker">
            Aplicar plantilla de embeds
            <select
              defaultValue=""
              onChange={(e) => {
                const template = templates.find(
                  (t) => String(t.id) === e.target.value,
                );
                if (template)
                  setValues({ ...values, visual: template.visual_payload });
              }}
            >
              <option value="">Seleccionar plantilla</option>
              {templates.map((t) => (
                <option key={String(t.id)} value={String(t.id)}>
                  {String(t.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="field-grid">
          {fields.map((field) => (
            <Input
              key={field.key}
              field={field}
              value={values[field.key]}
              onChange={(v) => setValues({ ...values, [field.key]: v })}
            />
          ))}
        </div>
        {!fields.length && (
          <p>
            La operación se aplicará al registro #
            {String(row.id ?? "seleccionado")}.
          </p>
        )}
        {action.confirm && (
          <label className="check confirm-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            He revisado esta operación y quiero continuar.
          </label>
        )}
        {error && (
          <div role="alert" className="notice">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <Button
            variant="outline"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={busy || (!!action.confirm && !confirmed)}
          >
            {busy
              ? "Guardando…"
              : action.read
                ? "Consultar"
                : action.confirm
                  ? "Confirmar operación"
                  : "Guardar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
function PreferencesPanel({
  prefs,
  onChange,
}: {
  prefs: Preferences;
  onChange: (prefs: Preferences) => void;
}) {
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Apariencia</h2>
            <p>Preferencias guardadas en este navegador.</p>
          </div>
          <Settings2 size={20} />
        </div>
        <div className="settings-fields">
          <label>
            Tema
            <select
              value={prefs.theme}
              onChange={(e) =>
                onChange({
                  ...prefs,
                  theme: e.target.value as Preferences["theme"],
                })
              }
            >
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
          <label>
            Acento
            <select
              value={prefs.accent}
              onChange={(e) =>
                onChange({
                  ...prefs,
                  accent: e.target.value as Preferences["accent"],
                })
              }
            >
              <option value="blue">Azul Studio</option>
              <option value="cyan">Cian</option>
              <option value="violet">Violeta</option>
            </select>
          </label>
          <label>
            Densidad
            <select
              value={prefs.density}
              onChange={(e) =>
                onChange({
                  ...prefs,
                  density: e.target.value as Preferences["density"],
                })
              }
            >
              <option value="comfortable">Cómoda</option>
              <option value="compact">Compacta</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.collapsed}
              onChange={(e) =>
                onChange({ ...prefs, collapsed: e.target.checked })
              }
            />
            Sidebar contraída
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.notifications}
              onChange={(e) =>
                onChange({ ...prefs, notifications: e.target.checked })
              }
            />
            Mostrar avisos operativos en Inicio
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Conexiones y acceso</h2>
            <p>Configuración operativa del workspace</p>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="settings-fields">
          <p>
            Las fuentes de GitHub se administran desde{" "}
            <Link href="/github">GitHub</Link>. Las fuentes del índice están en{" "}
            <Link href="/audit">Auditoría</Link>.
          </p>
          <p>
            Los permisos los determina Discord. Las asignaciones internas no
            sustituyen los roles ni la aprobación de miembros.
          </p>
          <p>Las credenciales se configuran en el entorno privado de Core.</p>
          <a href="/api/v1/openapi.json" target="_blank" rel="noreferrer">
            Consultar contrato HTTP ↗
          </a>
        </div>
      </section>
    </div>
  );
}
