import { streamedOrigin } from "../config/site.js";
import { selectMediaPlaylist } from "../proxy/media.js";
import type { Slot } from "../types/models.js";

export async function resolveStrmfreeSlot(slot: Slot): Promise<{ m3u8: string; referer: string }> {
  const origin = streamedOrigin || "https://streamfree.top";
  const streamKey = slot.id;
  const streamNo = slot.stream || "1";

  let embedUrl = "";
  try {
    const srcRes = await fetch(`${origin}/api/v1/sources/${encodeURIComponent(streamKey)}`);
    if (srcRes.ok) {
      const srcData = (await srcRes.json()) as { sources?: { quality: string; url: string; live?: boolean }[] };
      const list = srcData.sources || [];
      const idx = Math.max(0, Number(streamNo) - 1);
      if (list[idx]?.url) {
        embedUrl = list[idx].url;
      }
    }
  } catch {}

  const targetEmbedUrl = embedUrl || `${origin}/embed/general/${streamKey}`;

  const htmlRes = await fetch(targetEmbedUrl);
  if (!htmlRes.ok) throw new Error(`embed page fetch failed (${htmlRes.status})`);
  const html = await htmlRes.text();

  const oxMatch = html.match(/const _0x = ({[\s\S]*?});/);
  const oxStr = oxMatch?.[1];
  let ox: Record<string, { _t: string; _ta?: string; _e: number; _n: string; _s?: string; _sa?: string }> | null = null;
  if (oxStr) {
    try {
      const rawOx = new Function(`return ${oxStr};`)();
      const clean = (s: unknown): string => {
        if (s == null) return "";
        return String(s).replace(/[\r\n\s]+/g, "");
      };
      ox = {};
      for (const [q, params] of Object.entries(rawOx as Record<string, any>)) {
        ox[q] = {
          _t: clean(params._t),
          ...(params._ta ? { _ta: clean(params._ta) } : {}),
          _e: Number(clean(params._e)),
          _n: clean(params._n),
          ...(params._s ? { _s: clean(params._s) } : {}),
          ...(params._sa ? { _sa: clean(params._sa) } : {}),
        };
      }
    } catch {}
  }

  const qualityMatch = html.match(/const QUALITY = (['"])(.*?)\1/);
  const quality = (qualityMatch?.[2]) || (Number(streamNo) === 2 ? "540p" : "1080p");

  const variant = streamKey + quality;
  let serverName = "origin";
  try {
    const keyRes = await fetch(`${origin}/get-stream-key/${encodeURIComponent(streamKey)}`);
    if (keyRes.ok) {
      const keyData = (await keyRes.json()) as { is_external?: boolean; external_url?: string; server_name?: string };
      if (keyData.is_external && keyData.external_url) {
        return { m3u8: keyData.external_url, referer: targetEmbedUrl };
      }
      if (keyData.server_name) {
        serverName = keyData.server_name;
      }
    }
  } catch {}

  let path =
    serverName === "externalcdn"
      ? `/live-externalcdn/${variant}/index.m3u8`
      : serverName !== "origin"
        ? `/live-cdn/${variant}/index.m3u8`
        : `/live/${variant}/index.m3u8`;

  const params = ox ? ox[quality] : null;
  if (params) {
    const searchParams = new URLSearchParams();
    if (params._t) searchParams.set("_t", params._t);
    if (params._ta) searchParams.set("_ta", params._ta);
    if (params._e != null) searchParams.set("_e", String(params._e));
    if (params._n) searchParams.set("_n", params._n);
    if (params._s) searchParams.set("_s", params._s);
    if (params._sa) searchParams.set("_sa", params._sa);
    const qs = searchParams.toString();
    if (qs) path += `?${qs}`;
  }

  const m3u8 = `${origin}${path}`;
  const referer = targetEmbedUrl;
  await selectMediaPlaylist(m3u8, referer);
  return { m3u8, referer };
}

export async function unlockSlot(slot: Slot): Promise<{ m3u8: string; referer: string }> {
  return await resolveStrmfreeSlot(slot);
}
