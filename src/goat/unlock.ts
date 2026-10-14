import { embedOrigin } from "../config/site.js";
import { selectMediaPlaylist } from "../proxy/media.js";
import type { Slot } from "../types/models.js";
import { unlockGolf } from "./golf.js";
import { resolveGoat } from "./resolve.js";

export async function unlockSlot(slot: Slot): Promise<{ m3u8: string; referer: string }> {
  const unlocked = slot.source === "golf" ? await unlockGolf(slot) : await resolveGoat(slot);
  const referer = `${embedOrigin}/`;
  const m3u8 = await selectMediaPlaylist(unlocked, referer);
  return { m3u8, referer };
}
