const rawUrl = process.env.RENDER_URL;
if (!rawUrl) {
  throw new Error("Set RENDER_URL to the deployed service URL.");
}

const baseUrl = new URL(rawUrl);
if (baseUrl.protocol !== "https:") {
  throw new Error("RENDER_URL must use HTTPS.");
}

const page = await fetch(baseUrl, { signal: AbortSignal.timeout(180_000) });
if (!page.ok || !(page.headers.get("content-type") ?? "").includes("text/html")) {
  throw new Error(`Home page check failed: HTTP ${page.status}`);
}
console.log("Home page: ok");

const sportsUrl = new URL("/api/sports", baseUrl);
const sportsResponse = await fetch(sportsUrl, { signal: AbortSignal.timeout(180_000) });
if (!sportsResponse.ok) {
  throw new Error(`Sports API check failed: HTTP ${sportsResponse.status}`);
}
const sports = await sportsResponse.json();
if (!Array.isArray(sports)) {
  throw new Error("Sports API did not return a JSON array.");
}
console.log(`Sports API: ok (${sports.length} sports)`);
