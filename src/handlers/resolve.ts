import { findMatch, listStreams } from "../api/streamed.js";
import { embedOrigin } from "../config/site.js";
import { unlockGolf } from "../goat/golf.js";
import { makeSlot, resolveGoat } from "../goat/resolve.js";
import { relayLink, selectMediaPlaylist } from "../proxy/media.js";
import type { ResolveOk, ResolveResult, Slot, StreamLink } from "../types/models.js";

export type ResolveInput = {
  matchId?: string;
  source?: string;
  id?: string;
  stream?: string | number;
};

function pickStream(links: StreamLink[], stream: string | number): StreamLink {
  const want = String(stream);
  const hit = links.find((link) => String(link.streamNo) === want);
  if (!hit) throw new Error(`stream ${want} not found`);
  return hit;
}

async function slotFromInput(input: ResolveInput): Promise<{
  slot: Slot;
  matchId?: string;
  title?: string;
  embedUrl: string;
}> {
  if (input.matchId) {
    if (!input.source || input.stream == null) throw new Error("matchId requires source and stream");
    const match = await findMatch(input.matchId);
    const src = match.sources.find((entry) => entry.source === input.source);
    if (!src) throw new Error(`source ${input.source} not on match`);
    const link = pickStream(await listStreams(src.source, src.id), input.stream);
    return {
      matchId: match.id,
      title: match.title,
      embedUrl: link.embedUrl,
      slot: makeSlot(link.source, link.id, link.streamNo),
    };
  }

  if (!input.source || !input.id || input.stream == null) {
    throw new Error("source, id, and stream required");
  }
  const link = pickStream(await listStreams(input.source, input.id), input.stream);
  return {
    embedUrl: link.embedUrl,
    slot: makeSlot(link.source, link.id, link.streamNo),
  };
}

export async function resolveStream(input: ResolveInput, origin: string): Promise<ResolveResult> {
  let packed: Awaited<ReturnType<typeof slotFromInput>>;
  try {
    packed = await slotFromInput(input);
  } catch (err) {
    return { ok: false, stage: "input", error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const unlocked =
      packed.slot.source === "golf" ? await unlockGolf(packed.slot) : await resolveGoat(packed.slot);
    const referer = `${embedOrigin}/`;
    const m3u8 = await selectMediaPlaylist(unlocked, referer);
    const result: ResolveOk = {
      ok: true,
      source: packed.slot.source,
      stream: packed.slot.stream,
      embedUrl: packed.embedUrl,
      m3u8,
      referer,
      relay: relayLink(origin, m3u8, referer),
    };
    if (packed.matchId) result.matchId = packed.matchId;
    if (packed.title) result.title = packed.title;
    return result;
  } catch (err) {
    return { ok: false, stage: "resolve", error: err instanceof Error ? err.message : String(err) };
  }
}
