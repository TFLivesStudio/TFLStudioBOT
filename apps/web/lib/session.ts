import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionSchema, type Session } from "@tfl/shared";
export async function session(): Promise<Session> {
  const cookie = (await cookies()).get("tfl_studio_session");
  if (!cookie) redirect("/login");
  const origin = process.env.CORE_INTERNAL_URL;
  if (!origin) throw new Error("CORE_INTERNAL_URL is required");
  const res = await fetch(new URL("/api/v1/auth/me", origin), {
    headers: {
      cookie: `tfl_studio_session=${encodeURIComponent(cookie.value)}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 401) redirect("/login");
  if (!res.ok)
    throw new Error(
      "No se pudo verificar tu acceso con Core. Intenta de nuevo.",
    );
  return sessionSchema.parse(await res.json());
}
