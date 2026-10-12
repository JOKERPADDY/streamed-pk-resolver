import { httpHeaders } from "../api/headers.js";
import type { Slot } from "../types/models.js";

export async function postFetch(slot: Slot, body: Uint8Array): Promise<{ body: Buffer; goat: string }> {
  const referer = `${slot.origin}/embed/${slot.path}`;
  const res = await fetch(`${slot.origin}/fetch`, {
    method: "POST",
    headers: httpHeaders(referer, {
      "Content-Type": "application/octet-stream",
      Origin: slot.origin,
    }),
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    const detail = (await res.text()).trim() || res.statusText;
    throw new Error(`embed /fetch ${res.status}: ${detail}`);
  }
  const goat = res.headers.get("goat");
  if (!goat) throw new Error("missing goat header");
  return { body: Buffer.from(await res.arrayBuffer()), goat };
}
