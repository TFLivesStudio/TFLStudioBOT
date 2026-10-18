import { notFound } from "next/navigation";
import { session } from "@/lib/session";
import { Studio } from "@/components/studio";
import { sections } from "@/lib/modules";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  if (!sections.some((s) => s.key === section)) notFound();
  const [user, query] = await Promise.all([session(), searchParams]);
  if (sections.find((s) => s.key === section)?.admin && !user.admin)
    return (
      <main className="access">
        <h1>Acceso restringido</h1>
        <p>Este módulo requiere el rol ADMIN vigente de Discord.</p>
        <a href="/">Volver al inicio</a>
      </main>
    );
  return (
    <Studio
      section={section}
      session={user}
      initialSearch={
        typeof query.search === "string" ? query.search.slice(0, 120) : ""
      }
      initialTab={typeof query.tab === "string" ? query.tab : ""}
    />
  );
}
