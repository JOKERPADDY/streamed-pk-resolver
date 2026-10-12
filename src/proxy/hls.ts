import { Readable } from "node:stream";

import { relayLink } from "./media.js";
import { pull, pullGoatSegmentStream } from "./pull.js";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
} as const;

function absUri(uri: string, base: string): string {
  return uri.startsWith("http") ? uri : new URL(uri, base).href;
}

function rewrite(text: string, base: string, referer: string, origin: string): string {
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        if (!trimmed.includes('URI="')) return line;
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${relayLink(origin, absUri(uri, base), referer)}"`);
      }
      return relayLink(origin, absUri(trimmed, base), referer);
    })
    .join("\n");
}

export async function proxyHls(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get("url");
  const referer = url.searchParams.get("referer");
  if (!target || !referer) return new Response("url and referer required", { status: 400, headers: cors });

  try {
    if (target.includes(".m3u8")) {
      const raw = await pull(target, referer);
      if (!raw.length) throw new Error("empty upstream body");
      return new Response(rewrite(raw.toString("utf8"), target, referer, url.origin), {
        status: 200,
        headers: { ...cors, "Content-Type": "application/vnd.apple.mpegurl" },
      });
    }

    const { stream, contentLength } = await pullGoatSegmentStream(target, referer, request.signal);
    return new Response(Readable.toWeb(stream) as import("node:stream/web").ReadableStream, {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "video/mp2t",
        "Content-Length": String(contentLength),
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : String(err), { status: 502, headers: cors });
  }
}
