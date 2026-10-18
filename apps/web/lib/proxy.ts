/** Same-origin BFF. Targets a server-only fixed origin; never accepts an upstream URL from the browser. */
export async function proxyCore(request: Request): Promise<Response> {
  const incoming = new URL(request.url);
  const core = process.env.CORE_INTERNAL_URL;
  const web = process.env.WEB_ORIGIN;
  const fail = (code: string, status: number) =>
    Response.json(
      {
        error: {
          code,
          message:
            code === "CORE_UNAVAILABLE"
              ? "Core no está disponible. Intenta de nuevo."
              : "Solicitud no permitida.",
        },
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  if (!core || !web) return fail("CORE_UNAVAILABLE", 503);
  // Preserve only canonical API paths. No encoded slashes, dot segments or webhook forwarding.
  if (
    (!/^\/api\/v1\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+$/.test(
      incoming.pathname,
    ) &&
      incoming.pathname !== "/api/v1/openapi.json") ||
    incoming.pathname.includes("/integrations/")
  )
    return fail("INVALID_PATH", 400);
  const mutation = !["GET", "HEAD"].includes(request.method);
  if (mutation && request.headers.get("origin") !== web)
    return fail("ORIGIN_FORBIDDEN", 403);
  const headers = new Headers();
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .filter((p) => /^tfl_(studio_session|oauth_state)=/.test(p))
    .join("; ");
  if (cookie) headers.set("cookie", cookie);
  for (const key of ["content-type", "x-csrf-token", "idempotency-key"]) {
    const value = request.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (mutation) headers.set("origin", web);
  let body: ArrayBuffer | undefined;
  if (mutation) {
    // Read a bounded stream; Content-Length alone is controlled by the caller.
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 1024 * 1024) {
          await reader.cancel();
          return fail("BODY_TOO_LARGE", 413);
        }
        chunks.push(chunk.value);
      }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    body = bytes.buffer;
  }
  try {
    const target = new URL(incoming.pathname + incoming.search, core);
    if (target.origin !== new URL(core).origin)
      return fail("INVALID_PATH", 400);
    const result = await fetch(target, {
      method: request.method,
      headers,
      ...(body !== undefined ? { body } : {}),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const outgoing = new Headers({ "Cache-Control": "private, no-store" });
    for (const key of [
      "content-type",
      "content-disposition",
      "location",
      "retry-after",
    ]) {
      const value = result.headers.get(key);
      if (value) outgoing.set(key, value);
    }
    for (const value of result.headers.getSetCookie())
      outgoing.append("set-cookie", value);
    return new Response(result.body, {
      status: result.status,
      headers: outgoing,
    });
  } catch {
    return fail("CORE_UNAVAILABLE", 503);
  }
}
