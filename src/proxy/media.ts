import { pull } from "./pull.js";

export function relayLink(base: string, target: string, referer: string): string {
  return `${base.replace(/\/$/, "")}/api/hls?${new URLSearchParams({ url: target, referer })}`;
}

export async function selectMediaPlaylist(url: string, referer: string): Promise<string> {
  const text = (await pull(url, referer)).toString("utf8");
  if (!text.includes("#EXT-X-STREAM-INF")) return url;

  const lines = text.split(/\r?\n/);
  let bestBw = -1;
  let bestUri = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const bw = Number(/BANDWIDTH=(\d+)/.exec(line)?.[1] ?? 0);
    const next = lines[i + 1]?.trim() ?? "";
    if (!next || next.startsWith("#")) continue;
    if (bw >= bestBw) {
      bestBw = bw;
      bestUri = next;
    }
  }
  if (!bestUri) throw new Error("master playlist has no media uri");
  return bestUri.startsWith("http") ? bestUri : new URL(bestUri, url).href;
}
