export type Slot = {
  origin: string;
  source: string;
  id: string;
  stream: string;
  path: string;
};

export type Sport = { id: string; name: string };

export type Match = {
  id: string;
  title: string;
  category: string;
  date: number;
  sources: { source: string; id: string }[];
};

export type StreamLink = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  embedUrl: string;
  source: string;
  viewers: number;
};

export type ResolveOk = {
  ok: true;
  matchId?: string;
  title?: string;
  source: string;
  stream: string;
  embedUrl: string;
  m3u8: string;
  referer: string;
  relay: string;
};

export type ResolveResult =
  | ResolveOk
  | {
      ok: false;
      stage: string;
      error: string;
    };
