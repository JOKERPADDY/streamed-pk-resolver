import { handleRequest } from "./router.js";

export interface Env {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle API and Embed routes
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/embed/")) {
      return handleRequest(request);
    }

    // Try serving static asset if ASSETS binding exists
    if (env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (assetRes.status !== 404) {
        return assetRes;
      }
    }

    // Fallback to router (serves client index or 404)
    return handleRequest(request);
  },
};
