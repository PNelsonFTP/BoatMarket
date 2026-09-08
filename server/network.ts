import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
export async function publicUrl(input: string) {
  const url = new URL(input);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("A public HTTP(S) URL without credentials is required");
  if (url.port && !["80", "443"].includes(url.port))
    throw new Error("Only standard web ports are allowed");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((a) => {
      const ip = ipaddr.parse(a.address);
      return (
        (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress()
          ? (ip as ipaddr.IPv6).toIPv4Address()
          : ip
        ).range() !== "unicast"
      );
    })
  )
    throw new Error("Private and reserved network addresses are not allowed");
  return { url, address: addresses[0] };
}
export async function requestPublic(
  input: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
    maxBytes?: number;
  } = {},
  redirects = 0,
): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> {
  const { url, address } = await publicUrl(input);
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: options.method || "GET",
        headers: {
          "user-agent":
            process.env.GEOCODER_USER_AGENT ||
            "BoatScout/1.0 (personal search)",
          accept: "text/html,application/json",
          ...options.headers,
        },
        lookup: ((_host: unknown, opts: { all?: boolean }, cb: Function) =>
          opts.all
            ? cb(null, [address])
            : cb(null, address.address, address.family)) as never,
      },
      (res) => {
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > (options.maxBytes ?? 8 * 1024 * 1024)) {
            res.destroy(new Error("Response exceeded size limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", async () => {
          try {
            if (
              res.statusCode &&
              res.statusCode >= 300 &&
              res.statusCode < 400 &&
              res.headers.location
            ) {
              if (redirects >= 3) throw new Error("Too many redirects");
              const target = new URL(res.headers.location, url);
              if (target.origin !== url.origin)
                throw new Error(
                  "Cross-origin redirect: configure the final source URL directly",
                );
              if (options.method && options.method !== "GET")
                throw new Error("Delivery redirects are not followed");
              resolve(await requestPublic(target.href, options, redirects + 1));
            } else
              resolve({
                status: res.statusCode || 500,
                body: Buffer.concat(chunks).toString("utf8"),
                headers: res.headers,
              });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    const timer = setTimeout(
      () => req.destroy(new Error("Request timed out after 20 seconds")),
      20000,
    );
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}
