import { findMatch, listLiveCatalog, listMatchStreams, listSports } from "../api/streamed.js";
import type { Match, StreamLink } from "../types/models.js";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function getStreamKey(match: Match): string {
  if (match.id && !/^\d+$/.test(match.id)) {
    return match.id.toLowerCase();
  }
  return slugify(match.title || match.id);
}

export async function findMatchByStreamKey(streamKey: string): Promise<{ match: Match; streamKey: string } | null> {
  try {
    const matches = await listLiveCatalog();
    for (const match of matches) {
      const key = getStreamKey(match);
      if (key === streamKey.toLowerCase() || match.id.toLowerCase() === streamKey.toLowerCase()) {
        return { match, streamKey: key };
      }
    }
  } catch {}
  return null;
}

export async function getStreamSources(
  match: Match,
  origin: string,
): Promise<{ sources: { quality: string; url: string }[]; live_sources: { quality: string; url: string }[] }> {
  const streamKey = getStreamKey(match);
  const category = match.category || "general";
  let links: StreamLink[] = [];
  try {
    links = await listMatchStreams(match);
  } catch {
    links = [];
  }

  const baseEmbedUrl = `${origin}/embed/${category}/${streamKey}`;

  const defaultSources = [
    { quality: "FHD", url: baseEmbedUrl },
    { quality: "SD", url: baseEmbedUrl },
  ];

  const liveSources: { quality: string; url: string }[] = [];
  if (links.length > 0) {
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      if (!link) continue;
      const quality = link.hd ? (i === 0 ? "FHD" : "HD") : "SD";
      if (!liveSources.some((s) => s.quality === quality)) {
        liveSources.push({
          quality,
          url: baseEmbedUrl,
        });
      }
    }
  }

  const finalLiveSources = links.length > 0 ? (liveSources.length ? liveSources : [{ quality: "FHD", url: baseEmbedUrl }]) : [];

  return {
    sources: defaultSources,
    live_sources: finalLiveSources,
  };
}

export async function handleV1Streams(categoryFilter: string | null, origin: string): Promise<Response> {
  const matches = await listLiveCatalog(categoryFilter && categoryFilter !== "all" ? categoryFilter : null);

  const streams = [];
  for (const match of matches) {
    const category = match.category || "general";
    if (categoryFilter && categoryFilter !== "all" && category !== categoryFilter) continue;
    const streamKey = getStreamKey(match);
    const { sources, live_sources } = await getStreamSources(match, origin);
    streams.push({
      name: match.title,
      category,
      league: match.category ? titleCase(match.category) : "Live",
      stream_key: streamKey,
      match_timestamp: match.date || Math.floor(Date.now() / 1000),
      sources,
      live_sources,
      thumbnail_url: `${origin}/thumbnails/${category}_${streamKey}`,
    });
  }

  return Response.json(
    {
      count: streams.length,
      streams,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    },
  );
}

export async function handleV1StreamDetail(streamKey: string, origin: string): Promise<Response> {
  const found = await findMatchByStreamKey(streamKey);
  if (!found) {
    return Response.json({ error: "stream not found" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  }
  const { match } = found;
  const category = match.category || "general";
  const { sources, live_sources } = await getStreamSources(match, origin);
  const data = {
    name: match.title,
    category,
    league: match.category ? titleCase(match.category) : "Live",
    stream_key: streamKey,
    match_timestamp: match.date || Math.floor(Date.now() / 1000),
    sources,
    live_sources,
    thumbnail_url: `${origin}/thumbnails/${category}_${streamKey}`,
  };
  return Response.json(data, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function handleV1SourcesDetail(streamKey: string, origin: string): Promise<Response> {
  const found = await findMatchByStreamKey(streamKey);
  if (!found) {
    return Response.json({ error: "stream not found" }, { status: 404, headers: { "Access-Control-Allow-Origin": "*" } });
  }
  const { match } = found;
  const { sources, live_sources } = await getStreamSources(match, origin);
  const data = {
    stream_key: streamKey,
    sources,
    live_sources,
  };
  return Response.json(data, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

export async function handleV1Categories(): Promise<Response> {
  const sports = await listSports();
  const categories = sports.map((s) => s.id);
  return Response.json(
    { categories },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    },
  );
}
