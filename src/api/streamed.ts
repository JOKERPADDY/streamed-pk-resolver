import { streamedOrigin } from "../config/site.js";
import { sourceRank } from "../config/sources.js";
import type { Match, Sport, StreamLink } from "../types/models.js";
import { httpHeaders } from "./headers.js";

const catalogTtlMs = 20_000;
const catalogCache = new Map<string, { at: number; value: unknown }>();

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${streamedOrigin}${path}`, {
    headers: httpHeaders(undefined, { Accept: "application/json" }),
  });
  if (!res.ok) throw new Error(`strmfree.st ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

async function getCatalogJson<T>(path: string): Promise<T> {
  const hit = catalogCache.get(path);
  if (hit && Date.now() - hit.at < catalogTtlMs) return hit.value as T;
  const value = await getJson<T>(path);
  catalogCache.set(path, { at: Date.now(), value });
  return value;
}

export type V1StreamItem = {
  id: string;
  name: string;
  category: string;
  league?: string;
  stream_key: string;
  match_timestamp: number;
  viewers?: number;
  sources?: { quality: string; url: string }[];
  live_sources?: { quality: string; url: string }[];
};

export async function listSports(): Promise<Sport[]> {
  const data = await getCatalogJson<{ categories: string[] }>("/api/v1/categories");
  return (data.categories || []).map((cat) => ({
    id: cat,
    name: cat.charAt(0).toUpperCase() + cat.slice(1),
  }));
}

function mapV1StreamToMatch(item: V1StreamItem): Match {
  const sources = (item.live_sources && item.live_sources.length > 0 ? item.live_sources : item.sources || []).map((s, idx) => ({
    source: "embed",
    id: item.stream_key || item.id,
    streamNo: idx + 1,
    hd: s.quality === "FHD" || s.quality === "HD",
    embedUrl: s.url,
  }));

  return {
    id: item.stream_key || item.id,
    title: item.name,
    category: item.category || "general",
    date: item.match_timestamp || 0,
    sources: sources.map((s) => ({ source: s.source, id: s.id })),
  };
}

export async function listLiveCatalog(sport?: string | null): Promise<Match[]> {
  const data = await getCatalogJson<{ count: number; streams: V1StreamItem[] }>("/api/v1/streams");
  const streams = data.streams || [];
  const matches = streams.map(mapV1StreamToMatch);
  if (!sport || sport === "all") return matches;
  return matches.filter((m) => m.category.toLowerCase() === sport.toLowerCase());
}

export async function listMatches(sport: string, scope: "live" | "popular" | "all" = "live"): Promise<Match[]> {
  return listLiveCatalog(sport);
}

export async function listLivePopular(): Promise<Match[]> {
  return listLiveCatalog();
}

export async function findMatch(matchId: string): Promise<Match> {
  try {
    const data = await getJson<V1StreamItem>(`/api/v1/streams/${encodeURIComponent(matchId)}`);
    if (data && (data.id || data.stream_key)) {
      return mapV1StreamToMatch(data);
    }
  } catch {}
  const matches = await listLiveCatalog();
  const match = matches.find((m) => m.id === matchId || m.id.toLowerCase() === matchId.toLowerCase());
  if (!match) throw new Error(`match not found: ${matchId}`);
  return match;
}

export async function listStreams(source: string, id: string): Promise<StreamLink[]> {
  try {
    const data = await getJson<{ stream_key: string; sources?: { quality: string; url: string }[]; live_sources?: { quality: string; url: string }[] }>(
      `/api/v1/sources/${encodeURIComponent(id)}`
    );
    const list = data.live_sources && data.live_sources.length > 0 ? data.live_sources : data.sources || [];
    return list.map((s, idx) => ({
      id: id,
      streamNo: idx + 1,
      language: "en",
      hd: s.quality === "FHD" || s.quality === "HD",
      embedUrl: s.url,
      source: "embed",
      viewers: 50,
    }));
  } catch {
    return [];
  }
}

export async function listMatchStreams(match: Match): Promise<StreamLink[]> {
  return listStreams("embed", match.id);
}
