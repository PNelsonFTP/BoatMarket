import { requestPublic } from "./network";
/** Only a configured, exact origin may opt into local/private service access. */
export async function requestConfiguredService(
  url: string,
  base: string,
  localOrigins: string,
  options: { signal?: AbortSignal; headers?: Record<string, string> } = {},
) {
  const target = new URL(url),
    configured = new URL(base),
    signal = options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000);
  if (
    target.origin !== configured.origin ||
    !["https:", "http:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw new Error(
      "Service requests must stay on the configured HTTP(S) origin",
    );
  const allowed = localOrigins
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new URL(s).origin);
  if (!allowed.includes(configured.origin))
    return requestPublic(url, {
      ...options,
      signal,
      maxBytes: 2 * 1024 * 1024,
    });
  const response = await fetch(url, {
    headers: {
      "user-agent":
        process.env.GEOCODER_USER_AGENT ||
        "BoatScout/1.0 (personal boat search)",
      ...options.headers,
    },
    redirect: "error",
    signal,
  });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  if (reader)
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 2 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Service response exceeded size limit");
      }
      chunks.push(chunk.value);
    }
  return {
    status: response.status,
    body: Buffer.concat(chunks).toString("utf8"),
    headers: Object.fromEntries(response.headers),
  };
}
export function configuredBase(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Service base URL must be HTTP(S), without credentials, query, or fragment",
    );
  return url.href.replace(/\/+$/, "");
}
