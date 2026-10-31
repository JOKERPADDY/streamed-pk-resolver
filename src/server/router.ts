import { handleMatches, handleSports, handleStreams } from "../handlers/catalog.js";
import { handleEmbed } from "../handlers/embed.js";
import { handlePlaylist } from "../handlers/playlist.js";
import { resolveStream, type ResolveInput } from "../handlers/resolve.js";
import { handleV1Categories, handleV1SourcesDetail, handleV1StreamDetail, handleV1Streams } from "../handlers/v1.js";
import { proxyHls } from "../proxy/hls.js";
import { serveClient } from "./static.js";

export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  try {
    if (url.pathname === "/api/hls") return proxyHls(request);
    if (url.pathname === "/api/playlist") return handlePlaylist(request);
    if (url.pathname === "/api/sports") return handleSports();
    if (url.pathname === "/api/matches") {
      return handleMatches(url.searchParams.get("sport"), url.searchParams.get("scope"));
    }
    if (url.pathname === "/api/streams") {
      return handleStreams(
        url.searchParams.get("matchId"),
        url.searchParams.get("source"),
        url.searchParams.get("id"),
      );
    }
    if (url.pathname === "/api/v1/categories") return handleV1Categories();
    if (url.pathname === "/api/v1/streams") return handleV1Streams(url.searchParams.get("category"), url.origin);
    if (url.pathname.startsWith("/api/v1/streams/")) {
      const key = url.pathname.slice("/api/v1/streams/".length);
      return handleV1StreamDetail(key, url.origin);
    }
    if (url.pathname.startsWith("/api/v1/sources/")) {
      const key = url.pathname.slice("/api/v1/sources/".length);
      return handleV1SourcesDetail(key, url.origin);
    }
    if (url.pathname.startsWith("/embed/")) {
      return handleEmbed(url.pathname, url.origin, request);
    }
    if (url.pathname === "/api/resolve") {
      if (request.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
      let input: ResolveInput;
      try {
        input = ((await request.json()) ?? {}) as ResolveInput;
      } catch {
        return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
      }
      return Response.json(await resolveStream(input, url.origin));
    }
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    const accept = request.headers.get("accept") || "";
    if (accept.includes("application/json") && !accept.includes("text/html")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return serveClient(url.pathname);
  } catch (err) {
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
