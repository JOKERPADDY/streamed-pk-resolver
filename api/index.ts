import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";
import { handleRequest } from "../src/server/router.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const protocol = req.headers["x-forwarded-proto"] ? (req.headers["x-forwarded-proto"] as string).split(",")[0] : "https";
    const host = req.headers.host || "localhost";
    const fullUrl = `${protocol}://${host}${req.url}`;

    const headers = new Headers();
    for (const [key, val] of Object.entries(req.headers)) {
      if (typeof val === "string") headers.set(key, val);
      else if (Array.isArray(val)) {
        for (const item of val) headers.append(key, item);
      }
    }

    let body: Uint8Array | undefined;
    if (req.method !== "GET" && req.method !== "HEAD" && req.body) {
      if (typeof req.body === "string") {
        body = new TextEncoder().encode(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        body = new Uint8Array(req.body);
      } else if (typeof req.body === "object") {
        body = new TextEncoder().encode(JSON.stringify(req.body));
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };
    if (body) init.body = body;

    const webReq = new Request(fullUrl, init);
    const webRes = await handleRequest(webReq);

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    if (!webRes.body) {
      res.end();
      return;
    }

    const nodeStream = Readable.fromWeb(webRes.body as import("node:stream/web").ReadableStream);
    nodeStream.pipe(res);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }));
  }
}
