type FetchHandler = (
  input: Parameters<typeof globalThis.fetch>[0],
  init?: Parameters<typeof globalThis.fetch>[1],
) => ReturnType<typeof globalThis.fetch>;
/** Preserve Bun's optional optimization API while replacing only network behavior. */
export function withFetchExtras(
  handler: FetchHandler,
): typeof globalThis.fetch {
  return Object.assign(handler, { preconnect: globalThis.fetch.preconnect });
}
