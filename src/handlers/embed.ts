import { listMatchStreams } from "../api/streamed.js";
import { resolveStream } from "./resolve.js";
import { findMatchByStreamKey } from "./v1.js";

export async function handleEmbed(pathname: string, origin: string, request: Request): Promise<Response> {
  const parts = pathname.split("/").filter(Boolean);
  // parts: ['embed', category, stream_key]
  const streamKey = parts[2];

  if (!streamKey) {
    return new Response("Not found", { status: 404 });
  }

  const found = await findMatchByStreamKey(streamKey);
  if (!found) {
    return new Response(
      `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Stream Offline</title>
<style>body{background:#000;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui}</style>
</head>
<body><div><h2>Stream not found or offline</h2></div></body></html>`,
      {
        status: 404,
        headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*" },
      },
    );
  }

  const { match } = found;
  let resolvedM3u8 = "";
  let errorMsg = "";

  try {
    const links = await listMatchStreams(match);
    if (links.length > 0) {
      const link = links[0];
      if (link) {
        const res = await resolveStream(
          {
            matchId: match.id,
            source: link.source,
            stream: link.streamNo,
          },
          origin,
        );
        if (res.ok && res.relay) {
          resolvedM3u8 = res.relay;
        } else if (!res.ok) {
          errorMsg = res.error;
        }
      }
    } else {
      errorMsg = "No active streams available yet.";
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${match.title} - Stream Embed</title>
  <style>
    body, html { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; color: #fff; font-family: system-ui, sans-serif; overflow: hidden; }
    .player-container { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; }
    video { width: 100%; height: 100%; object-fit: contain; background: #000; }
    .overlay { position: absolute; top: 16px; left: 16px; background: rgba(0,0,0,0.7); padding: 8px 16px; border-radius: 8px; font-size: 14px; z-index: 10; pointer-events: none; }
    .error-msg { text-align: center; padding: 24px; color: #ff6b6b; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js"></script>
</head>
<body>
  <div class="player-container">
    <div class="overlay">${match.title}</div>
    ${
      resolvedM3u8
        ? `<video id="video" controls autoplay playsinline></video>`
        : `<div class="error-msg"><h2>Stream Starting Soon</h2><p>${errorMsg || "Waiting for stream to go live..."}</p><button onclick="location.reload()" style="margin-top:12px;padding:8px 16px;background:#e5387a;color:#fff;border:none;border-radius:4px;cursor:pointer;">Retry</button></div>`
    }
  </div>
  ${
    resolvedM3u8
      ? `<script>
    const video = document.getElementById('video');
    const url = ${JSON.stringify(resolvedM3u8)};
    if (video) {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('loadedmetadata', () => video.play().catch(() => {}));
      } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
        const hls = new Hls({ maxBufferSize: 0, liveSyncDurationCount: 7 });
        hls.loadSource(url);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      }
    }
  </script>`
      : `<script>
    setTimeout(() => location.reload(), 10000);
  </script>`
  }
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
