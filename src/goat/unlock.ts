import { embedOrigin, streamedOrigin } from "../config/site.js";
import { selectMediaPlaylist } from "../proxy/media.js";
import type { Slot } from "../types/models.js";
import { unlockGolf } from "./golf.js";
import { resolveGoat } from "./resolve.js";

export async function resolveStrmfreeSlot(slot: Slot): Promise<{ m3u8: string; referer: string }> {
  const origin = streamedOrigin || "https://strmfree.st";
  const streamKey = slot.id;
  const streamNo = slot.stream || "1";

  let embedUrl = "";
  try {
    const srcRes = await fetch(`${origin}/api/v1/sources/${encodeURIComponent(streamKey)}`);
    if (srcRes.ok) {
      const srcData = (await srcRes.json()) as { sources?: { url: string }[]; live_sources?: { url: string }[] };
      const list = srcData.live_sources && srcData.live_sources.length > 0 ? srcData.live_sources : srcData.sources || [];
      const idx = Math.max(0, Number(streamNo) - 1);
      if (list[idx]?.url) {
        embedUrl = list[idx].url;
      }
    }
  } catch {}

  const keyRes = await fetch(`${origin}/get-stream-key/${encodeURIComponent(streamKey)}`);
  if (!keyRes.ok) throw new Error(`get-stream-key failed (${keyRes.status})`);
  const keyData = (await keyRes.json()) as {
    is_external?: boolean;
    external_url?: string;
    server_name?: string;
  };

  if (keyData.is_external && keyData.external_url) {
    return { m3u8: keyData.external_url, referer: `${origin}/` };
  }

  const targetEmbedUrl = embedUrl || `${origin}/embed/general/${streamKey}1080p`;
  const htmlRes = await fetch(targetEmbedUrl);
  if (!htmlRes.ok) throw new Error(`embed page fetch failed (${htmlRes.status})`);
  const html = await htmlRes.text();

  const oxMatch = html.match(/const _0x = ({[^;]+});/);
  const oxStr = oxMatch?.[1];
  const ox = oxStr ? (JSON.parse(oxStr) as Record<string, { _t: string; _e: number; _n: string }>) : null;

  const qualityMatch = html.match(/const QUALITY = (['"])(.*?)\1/);
  const quality = (qualityMatch?.[2]) || (Number(streamNo) === 2 ? "540p" : "1080p");

  const variant = streamKey + quality;
  const serverName = keyData.server_name || "origin";
  let path =
    serverName === "externalcdn"
      ? `/live-externalcdn/${variant}/index.m3u8`
      : serverName !== "origin"
        ? `/live-cdn/${variant}/index.m3u8`
        : `/live/${variant}/index.m3u8`;

  const params = ox ? ox[quality] : null;
  if (params) {
    path += `?_t=${params._t}&_e=${params._e}&_n=${params._n}`;
  }

  const m3u8 = `${origin}${path}`;
  const referer = `${origin}/`;
  const finalM3u8 = await selectMediaPlaylist(m3u8, referer);
  return { m3u8: finalM3u8, referer };
}

export async function unlockSlot(slot: Slot): Promise<{ m3u8: string; referer: string }> {
  try {
    return await resolveStrmfreeSlot(slot);
  } catch {
    const unlocked = slot.source === "golf" ? await unlockGolf(slot) : await resolveGoat(slot);
    const referer = `${embedOrigin}/`;
    const m3u8 = await selectMediaPlaylist(unlocked, referer);
    return { m3u8, referer };
  }
}

