export class ApiFailure extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    csrf?: string;
    key?: string;
    signal?: AbortSignal;
  },
): Promise<T> {
  const res = await fetch("/api/v1" + path, {
    cache: "no-store",
    credentials: "same-origin",
    method: options?.method ?? "GET",
    headers: {
      ...(options?.body !== undefined
        ? { "content-type": "application/json" }
        : {}),
      ...(options?.csrf ? { "x-csrf-token": options.csrf } : {}),
      ...(options?.key ? { "idempotency-key": options.key } : {}),
    },
    ...(options?.body !== undefined
      ? { body: JSON.stringify(options.body) }
      : {}),
    ...(options?.signal ? { signal: options.signal } : {}),
  });
  if (res.status === 401) {
    window.location.assign("/login");
    throw new ApiFailure(401, "Tu sesión ha caducado.");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new ApiFailure(
      res.status,
      data?.error?.message ?? "No se pudo completar la operación.",
    );
  }
  return res.json() as Promise<T>;
}
