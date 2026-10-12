import { embedOrigin } from "../config/site.js";
import type { Slot } from "../types/models.js";
import { postFetch } from "./fetch.js";
import { unlock } from "./lock.js";
import { encodeFetchBody } from "./proto.js";

export function makeSlot(source: string, id: string, stream: string | number, origin = embedOrigin): Slot {
  const streamStr = String(stream);
  return {
    origin,
    source,
    id,
    stream: streamStr,
    path: `${source}/${id}/${streamStr}`,
  };
}

export async function resolveGoat(slot: Slot): Promise<string> {
  const { body, goat } = await postFetch(slot, encodeFetchBody(slot.source, slot.id, slot.stream));
  return unlock(slot, goat, body);
}
