import { isIP } from "node:net";
import { embedOrigin, streamedOrigin } from "../config/site.js";

const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const maxRedirects = 5;

function originHost(origin: string): string {
  const url = new URL(origin);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    throw new Error(`upstream origin must be HTTPS: ${origin}`);
  }
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

function configuredHost(value: string): string {
  const host = value.trim().toLowerCase().replace(/\.$/, "");
  if (!host || host.includes("/") || host.includes(":") || isIP(host)) {
    throw new Error(`invalid allowed upstream host: ${value}`);
  }
  return host;
}

const exactHosts = new Set([
  originHost(streamedOrigin),
  originHost(embedOrigin),
]);

const allowedDomains = new Set([
  "strmd.st",
  "strmfree.st",
  "streamfree.top",
  "embed.st",
  ...(process.env.ALLOWED_UPSTREAM_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .map(configuredHost),
]);

export function assertAllowedUpstreamUrl(value: string | URL): URL {
  let url: URL;
  try {
    url = typeof value === "string" ? new URL(value) : value;
  } catch {
    throw new Error("invalid upstream URL");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443") ||
    isIP(host) ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    (!exactHosts.has(host) &&
      ![...allowedDomains].some((allowed) => host === allowed || host.endsWith(`.${allowed}`)))
  ) {
    throw new Error(`upstream host is not allowed: ${host || "unknown"}`);
  }
  return url;
}

export async function safeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  let url = assertAllowedUpstreamUrl(input);
  let options: RequestInit = { ...init };
  for (let redirects = 0; ; redirects++) {
    const response = await fetch(url, { ...options, redirect: "manual" });
    if (!redirectStatuses.has(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error(`upstream redirect ${response.status} missing location`);
    if (redirects >= maxRedirects) throw new Error("too many upstream redirects");
    const nextUrl = assertAllowedUpstreamUrl(new URL(location, url));
    const method = (options.method ?? "GET").toUpperCase();
    if (
      (response.status === 303 && method !== "HEAD") ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      const headers = new Headers(options.headers);
      headers.delete("content-encoding");
      headers.delete("content-language");
      headers.delete("content-length");
      headers.delete("content-location");
      headers.delete("content-type");
      options = { ...options, method: "GET", headers };
      delete options.body;
    }
    url = nextUrl;
  }
}
