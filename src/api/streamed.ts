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
  if (!res.ok) throw new Error(`streamed.pk ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

async function getCatalogJson<T>(path: string): Promise<T> {
  const hit = catalogCache.get(path);
  if (hit && Date.now() - hit.at < catalogTtlMs) return hit.value as T;
  const value = await getJson<T>(path);
  catalogCache.set(path, { at: Date.now(), value });
  return value;
}

function isChannel(match: Match): boolean {
  return match.date === 0;
}

function sportFilter(sport?: string | null): (match: Match) => boolean {
  if (!sport || sport === "all") return () => true;
  return (match) => match.category === sport;
}

export function listSports(): Promise<Sport[]> {
  return getCatalogJson("/api/sports");
}

export function listStreams(source: string, id: string): Promise<StreamLink[]> {
  return getJson(`/api/stream/${encodeURIComponent(source)}/${encodeURIComponent(id)}`);
}

async function matchHasStreams(match: Match): Promise<boolean> {
  if (!match.sources.length) return false;
  return new Promise((resolve) => {
    let left = match.sources.length;
    let settled = false;
    for (const src of match.sources) {
      void listStreams(src.source, src.id)
        .then((links) => {
          if (settled) return;
          if (links.length > 0) {
            settled = true;
            resolve(true);
            return;
          }
          left -= 1;
          if (left === 0) resolve(false);
        })
        .catch(() => {
          if (settled) return;
          left -= 1;
          if (left === 0) resolve(false);
        });
    }
  });
}

async function withActiveStreams(matches: Match[]): Promise<Match[]> {
  const flags = await Promise.all(matches.map(matchHasStreams));
  return matches.filter((_, index) => flags[index]);
}

function mergeLiveAndChannels(live: Match[], all: Match[], sport?: string | null): Match[] {
  const keep = sportFilter(sport);
  const scopedLive = live.filter(keep);
  const channels = all.filter((match) => isChannel(match) && keep(match));
  const byId = new Map<string, Match>();
  for (const match of channels) byId.set(match.id, match);
  for (const match of scopedLive) byId.set(match.id, match);

  const liveOrder = new Map(scopedLive.map((match, index) => [match.id, index]));
  return [...byId.values()].sort((a, b) => {
    const ac = isChannel(a) ? 0 : 1;
    const bc = isChannel(b) ? 0 : 1;
    if (ac !== bc) return ac - bc;
    if (ac === 0) return a.title.localeCompare(b.title);
    return (liveOrder.get(a.id) ?? 0) - (liveOrder.get(b.id) ?? 0);
  });
}

async function listLive(sport?: string | null): Promise<Match[]> {
  const [live, all] = await Promise.all([
    getCatalogJson<Match[]>("/api/matches/live"),
    getCatalogJson<Match[]>("/api/matches/all"),
  ]);
  return withActiveStreams(mergeLiveAndChannels(live, all, sport));
}

export async function listMatches(sport: string, scope: "live" | "popular" | "all" = "live"): Promise<Match[]> {
  if (scope === "popular") return getCatalogJson(`/api/matches/${encodeURIComponent(sport)}/popular`);
  if (scope === "all") return getCatalogJson(`/api/matches/${encodeURIComponent(sport)}`);
  return listLive(sport);
}

export function listLivePopular(): Promise<Match[]> {
  return getCatalogJson("/api/matches/live/popular");
}

export async function findMatch(matchId: string): Promise<Match> {
  const [live, all] = await Promise.all([
    getCatalogJson<Match[]>("/api/matches/live"),
    getCatalogJson<Match[]>("/api/matches/all"),
  ]);
  const match = live.find((item) => item.id === matchId) ?? all.find((item) => item.id === matchId);
  if (!match) throw new Error(`match not found: ${matchId}`);
  return match;
}

export async function listMatchStreams(match: Match): Promise<StreamLink[]> {
  const groups = await Promise.all(match.sources.map((src) => listStreams(src.source, src.id)));
  return groups
    .flat()
    .filter((link) => link.source && link.id)
    .sort((a, b) => sourceRank(a.source) - sourceRank(b.source) || Number(b.hd) - Number(a.hd) || a.streamNo - b.streamNo);
}
