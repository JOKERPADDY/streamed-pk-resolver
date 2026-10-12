import { Readable } from "node:stream";

import { Impit, type RequestInit } from "impit";

const cdn = new Impit({ browser: "chrome151" });

function headers(referer: string): Record<string, string> {
  return {
    Origin: new URL(referer).origin,
    Referer: referer,
  };
}

async function request(url: string, referer: string, signal?: AbortSignal) {
  const init: RequestInit = { headers: headers(referer) };
  if (signal) init.signal = signal;
  const res = await cdn.fetch(url, init);
  if (!res.ok) throw new Error(`cdn ${res.status}: ${res.statusText.trim() || "failed"}`);
  return res;
}

export async function pull(url: string, referer: string): Promise<Buffer> {
  return Buffer.from(await (await request(url, referer)).arrayBuffer());
}

export function pullGoatSegmentStream(
  url: string,
  referer: string,
  signal?: AbortSignal,
): Promise<{ stream: Readable; contentLength: number }> {
  const ac = new AbortController();
  if (signal?.aborted) return Promise.reject(new Error("aborted"));
  signal?.addEventListener("abort", () => ac.abort(), { once: true });

  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);
    let settled = false;
    let finished = false;
    let left = 0;
    let total = 0;
    let out: Readable | null = null;

    const stop = () => {
      if (!ac.signal.aborted) ac.abort();
    };

    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      stop();
      if (settled) {
        out?.destroy(error);
        return;
      }
      settled = true;
      reject(error);
    };

    const onData = (raw: Buffer) => {
      if (finished) return;
      if (!settled) {
        pending = Buffer.concat([pending, raw]);
        const meta = readGoatTsMeta(pending, total);
        if (!meta) {
          if (pending.length > 16384) fail(new Error("goat segment header not found"));
          return;
        }
        settled = true;
        out = new Readable({
          read() {},
          destroy(_err, cb) {
            stop();
            cb(null);
          },
        });
        const available = pending.subarray(meta.offset);
        const first = available.subarray(0, Math.min(available.length, meta.length));
        left = meta.length - first.length;
        out.push(first);
        if (left <= 0) {
          finished = true;
          stop();
          out.push(null);
        }
        resolve({ stream: out, contentLength: meta.length });
        return;
      }
      if (!out) return;
      const take = raw.subarray(0, left);
      left -= take.length;
      out.push(take);
      if (left <= 0) {
        finished = true;
        stop();
        out.push(null);
      }
    };

    void (async () => {
      const res = await request(url, referer, ac.signal);
      if (!res.body) throw new Error("empty upstream body");
      const headerLen = Number(res.headers.get("content-length"));
      total = Number.isFinite(headerLen) && headerLen > 0 ? headerLen : 0;
      const node = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream<Uint8Array>);
      node.on("data", (chunk: Buffer | Uint8Array) => onData(Buffer.from(chunk)));
      node.on("error", (err: Error) => {
        if (!finished) fail(err);
      });
      node.on("end", () => {
        if (!finished) fail(new Error("cdn stream ended early"));
      });
    })().catch((err: unknown) => {
      if (!finished) fail(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function readGoatTsMeta(buf: Buffer, total: number): { offset: number; length: number } | null {
  if (buf.length < 20 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  const declaredEnd = 8 + buf.readUInt32LE(4);
  if (total > declaredEnd && buf.length > declaredEnd && buf[declaredEnd] === 0x47) {
    const length = Math.floor((total - declaredEnd) / 188) * 188;
    return length > 0 ? { offset: declaredEnd, length } : null;
  }
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const tag = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (tag === "EXIF" || tag === "exif") {
      const length = Math.floor(size / 188) * 188;
      return length > 0 ? { offset: data, length } : null;
    }
    const next = data + size + (size & 1);
    if (next > buf.length) return null;
    offset = next;
  }
  return null;
}
