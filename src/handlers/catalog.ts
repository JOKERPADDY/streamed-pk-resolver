import { findMatch, listLivePopular, listMatchStreams, listMatches, listSports, listStreams } from "../api/streamed.js";
import { sourceMeta } from "../config/sources.js";

export async function handleSports(): Promise<Response> {
  return Response.json(await listSports());
}

export async function handleMatches(sport: string | null, scope: string | null): Promise<Response> {
  if (!sport || sport === "live-popular") {
    return Response.json(await listLivePopular());
  }
  const mode = scope === "popular" || scope === "all" ? scope : "live";
  return Response.json(await listMatches(sport, mode));
}

export async function handleStreams(matchId: string | null, source: string | null, id: string | null): Promise<Response> {
  if (matchId) {
    const match = await findMatch(matchId);
    const links = await listMatchStreams(match);
    return Response.json({
      match,
      streams: links.map((link) => {
        const meta = sourceMeta(link.source);
        return {
          ...link,
          matchId: match.id,
          title: match.title,
          sourceName: meta.name,
          sourceDescription: meta.description,
        };
      }),
    });
  }
  if (!source || !id) return Response.json({ error: "matchId or source+id required" }, { status: 400 });
  const links = await listStreams(source, id);
  const meta = sourceMeta(source);
  return Response.json({
    streams: links.map((link) => ({
      ...link,
      sourceName: meta.name,
      sourceDescription: meta.description,
    })),
  });
}
