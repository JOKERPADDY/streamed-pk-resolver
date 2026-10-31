import { handleRequest } from "../src/server/router.js";

interface EventContext {
  request: Request;
  next: () => Promise<Response>;
}

export async function onRequest(context: EventContext): Promise<Response> {
  const url = new URL(context.request.url);

  // Serve static assets directly from Pages CDN for static UI files
  if (url.pathname === "/" || url.pathname.startsWith("/styles.css") || url.pathname.startsWith("/app.js") || url.pathname.endsWith(".png") || url.pathname.endsWith(".ico")) {
    return context.next();
  }

  return handleRequest(context.request);
}
