import { httpHeaders } from "../api/headers.js";
import { embedOrigin } from "../config/site.js";
import { makeSlot, resolveGoat } from "../goat/resolve.js";
import type { Slot } from "../types/models.js";

function iframeSrc(html: string): string {
  const m = html.match(/iframe src="([^"]+)"/i);
  if (!m?.[1]) throw new Error("golf embed iframe missing");
  return m[1].replace(/&amp;/g, "&");
}

function ingestFromRocky(html: string): { id: string; stream: string } {
  const m = html.match(/data-source="([^"]+)"/);
  if (!m?.[1]) throw new Error("rockystream data-source missing");
  let decoded: string;
  try {
    decoded = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    throw new Error("rockystream data-source not base64");
  }
  const path = new URL(decoded).pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (path[0] !== "embed" || path[1] !== "ingest" || !path[2] || !path[3]) {
    throw new Error(`unexpected ingest url ${decoded}`);
  }
  return { id: path[2], stream: path[3] };
}

async function resolveGolf(slot: Slot): Promise<Slot> {
  const embedUrl = `${slot.origin}/embed/${slot.path}`;
  const embedHtml = await (await fetch(embedUrl, { headers: httpHeaders(`${slot.origin}/`) })).text();
  const rockyUrl = iframeSrc(embedHtml);
  const rockyHtml = await (await fetch(rockyUrl, { headers: httpHeaders(embedUrl) })).text();
  const ingest = ingestFromRocky(rockyHtml);
  return makeSlot("ingest", ingest.id, ingest.stream, embedOrigin);
}

export async function unlockGolf(slot: Slot): Promise<string> {
  return resolveGoat(await resolveGolf(slot));
}
