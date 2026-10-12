type Sport = { id: string; name: string };

type Match = {
  id: string;
  title: string;
  category: string;
  date?: number;
  sources: { source: string; id: string }[];
};

type StreamRow = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  source: string;
  sourceName?: string;
  sourceDescription?: string;
  viewers: number;
  matchId?: string;
  title?: string;
};

type ResolveResult = {
  ok: boolean;
  title?: string;
  m3u8?: string;
  relay?: string;
  referer?: string;
  error?: string;
};

type PlaybackTimer = {
  frame: number;
  markResolved: () => void;
  markPlayed: () => void;
};

type HlsPlayer = {
  destroy: () => void;
  loadSource: (url: string) => void;
  attachMedia: (media: HTMLMediaElement) => void;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
};

type HlsApi = {
  isSupported: () => boolean;
  Events: { ERROR: string; MANIFEST_PARSED: string };
  new (config?: Record<string, unknown>): HlsPlayer;
};

declare const Hls: HlsApi;

const ui = {
  sports: document.getElementById("sport-tabs")!,
  refresh: document.getElementById("refresh-button") as HTMLButtonElement,
  liveMeta: document.getElementById("live-meta")!,
  status: document.querySelector(".status") as HTMLElement,
  matches: document.getElementById("match-list")!,
  matchCount: document.getElementById("match-count")!,
  kicker: document.getElementById("stream-kicker")!,
  title: document.getElementById("stream-title")!,
  servers: document.getElementById("stream-list")!,
  serversEmpty: document.getElementById("stream-empty")!,
  serverCount: document.getElementById("stream-count")!,
  screen: document.querySelector(".screen") as HTMLElement,
  video: document.getElementById("video-element") as HTMLVideoElement,
  exports: document.getElementById("exports")!,
  error: document.getElementById("error-message")!,
  direct: document.getElementById("export-direct-url") as HTMLInputElement,
  proxied: document.getElementById("export-proxied-url") as HTMLInputElement,
  vlc: document.getElementById("export-vlc-url") as HTMLInputElement,
  mpv: document.getElementById("export-mpv-url") as HTMLInputElement,
  resolveMs: document.getElementById("timing-resolve")!,
  playMs: document.getElementById("timing-play")!,
};

const state = {
  sportId: "all",
  sports: [] as Sport[],
  matches: [] as Match[],
  streams: [] as StreamRow[],
  activeMatchId: null as string | null,
  activeStreamKey: null as string | null,
  loading: false,
  resolving: false,
  hls: null as HlsPlayer | null,
  playbackGen: 0,
  timer: null as PlaybackTimer | null,
};

const formatMs = (ms: number) => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);
const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
const streamKey = (stream: StreamRow) => `${stream.source}:${stream.id}:${stream.streamNo}`;
const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
const sourceLabel = (stream: StreamRow) => stream.sourceName || titleCase(stream.source);
const isChannel = (match: Match) => match.date === 0;
const feedMeta = (matches: Match[]) => {
  const channels = matches.filter(isChannel).length;
  const live = matches.length - channels;
  if (channels && live) return `${live} live · ${channels} channels`;
  if (channels) return `${channels} channels`;
  return `${live} live`;
};

const showError = (message: string) => {
  ui.error.textContent = message;
  ui.error.hidden = false;
};

const clearError = () => {
  ui.error.hidden = true;
  ui.error.textContent = "";
};

const setIdle = () => {
  if (state.timer) cancelAnimationFrame(state.timer.frame);
  state.timer = null;
  ui.resolveMs.textContent = ui.playMs.textContent = "—";
  ui.resolveMs.className = ui.playMs.className = "timing__v";
  ui.screen.classList.remove("is-active");
  ui.video.hidden = true;
  ui.exports.hidden = true;
  ui.kicker.textContent = "Ready";
  ui.title.textContent = "Choose a Match to Start";
  ui.direct.value = ui.proxied.value = ui.vlc.value = ui.mpv.value = "";
};

const setPlaying = () => {
  ui.screen.classList.add("is-active");
  ui.video.hidden = false;
  ui.exports.hidden = false;
};

const startTiming = (): PlaybackTimer => {
  if (state.timer) cancelAnimationFrame(state.timer.frame);
  ui.resolveMs.textContent = "0ms";
  ui.playMs.textContent = "waiting";
  ui.resolveMs.className = "timing__v is-live";
  ui.playMs.className = "timing__v";
  const started = performance.now();
  let resolvedAt: number | null = null;
  let playedAt: number | null = null;
  const tick = () => {
    const now = performance.now();
    if (resolvedAt == null) ui.resolveMs.textContent = formatMs(now - started);
    if (resolvedAt != null && playedAt == null) {
      ui.playMs.textContent = formatMs(now - resolvedAt);
      ui.playMs.className = "timing__v is-live";
    }
    if (playedAt == null && state.timer) state.timer.frame = requestAnimationFrame(tick);
  };
  state.timer = {
    frame: requestAnimationFrame(tick),
    markResolved() {
      if (resolvedAt != null) return;
      resolvedAt = performance.now();
      ui.resolveMs.textContent = formatMs(resolvedAt - started);
      ui.resolveMs.className = "timing__v is-done";
      ui.playMs.textContent = "0ms";
      ui.playMs.className = "timing__v is-live";
    },
    markPlayed() {
      if (playedAt != null) return;
      playedAt = performance.now();
      if (resolvedAt == null) this.markResolved();
      ui.playMs.textContent = formatMs(playedAt - (resolvedAt as number));
      ui.playMs.className = "timing__v is-done";
      if (state.timer) cancelAnimationFrame(state.timer.frame);
      state.timer = null;
    },
  };
  return state.timer;
};

const stopPlayback = () => {
  state.playbackGen += 1;
  state.hls?.destroy();
  state.hls = null;
  ui.video.pause();
  ui.video.removeAttribute("src");
  ui.video.load();
};

const startPlayback = (url: string, timing: PlaybackTimer) => {
  stopPlayback();
  const gen = state.playbackGen;
  const isCurrent = () => gen === state.playbackGen;
  return new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (ok: boolean, error?: Error) => {
      if (!isCurrent() || done) return;
      done = true;
      ui.video.removeEventListener("playing", onPlaying);
      ui.video.removeEventListener("error", onError);
      if (ok) {
        clearError();
        timing.markPlayed();
        resolve();
      } else reject(error ?? new Error("playback failed"));
    };
    const onPlaying = () => finish(true);
    const onError = () => finish(false, new Error("playback failed"));
    ui.video.addEventListener("playing", onPlaying);
    ui.video.addEventListener("error", onError);

    if (Hls.isSupported()) {
      state.hls = new Hls({
        enableWorker: true,
        liveDurationInfinity: true,
        maxBufferSize: 0,
        maxBufferLength: 10,
        liveSyncDurationCount: 7,
      });
      state.hls.on(Hls.Events.ERROR, (_event, data) => {
        if ((data as { fatal?: boolean } | undefined)?.fatal) finish(false, new Error("playback failed"));
      });
      state.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isCurrent()) void ui.video.play().catch(() => undefined);
      });
      state.hls.attachMedia(ui.video);
      state.hls.loadSource(url);
      return;
    }
    finish(false, new Error("HLS not supported"));
  });
};

const bindExports = (result: ResolveResult) => {
  const streamUrl = result.m3u8 ?? "";
  const referer = result.referer ?? "";
  ui.direct.value = streamUrl;
  ui.proxied.value = result.relay ?? "";
  ui.vlc.value = streamUrl && referer ? `vlc --http-referrer ${shellQuote(referer)} ${shellQuote(streamUrl)}` : "";
  ui.mpv.value = streamUrl && referer ? `mpv --referrer=${shellQuote(referer)} ${shellQuote(streamUrl)}` : "";
};

const renderSports = () => {
  const tabs: Sport[] = [{ id: "all", name: "All" }, ...state.sports];
  ui.sports.replaceChildren(
    ...tabs.map((sport) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sports__btn${sport.id === state.sportId ? " is-active" : ""}`;
      button.textContent = sport.name;
      button.onclick = () => {
        if (state.sportId === sport.id) return;
        state.sportId = sport.id;
        state.activeMatchId = null;
        state.activeStreamKey = null;
        state.streams = [];
        renderServers();
        renderSports();
        void loadMatches();
      };
      return button;
    }),
  );
};

const renderMatches = () => {
  ui.matchCount.textContent = String(state.matches.length);
  ui.matches.replaceChildren(
    ...state.matches.map((match) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = `match${match.id === state.activeMatchId ? " is-active" : ""}`;
      button.disabled = state.resolving;
      const title = document.createElement("span");
      title.className = "match__title";
      title.textContent = match.title;
      const meta = document.createElement("span");
      meta.className = "match__meta";
      const sources = [...new Set(match.sources.map((entry) => entry.source))]
        .map(titleCase)
        .join(" · ");
      const kind = isChannel(match) ? "Channel" : match.category;
      meta.textContent =
        state.sportId === "all" || isChannel(match)
          ? `${kind} · ${sources || "No sources"}`
          : sources || "No sources";
      button.append(title, meta);
      button.onclick = () => void selectMatch(match);
      item.append(button);
      return item;
    }),
  );
  if (!state.matches.length && !state.loading) {
    const empty = document.createElement("li");
    empty.className = "matches__empty";
    empty.textContent = "No live matches or channels for this sport right now.";
    ui.matches.append(empty);
  }
};

const groupBySource = (streams: StreamRow[]) => {
  const order: string[] = [];
  const map = new Map<string, StreamRow[]>();
  for (const stream of streams) {
    if (!map.has(stream.source)) {
      map.set(stream.source, []);
      order.push(stream.source);
    }
    map.get(stream.source)!.push(stream);
  }
  return order.map((source) => {
    const items = (map.get(source) ?? []).sort(
      (a, b) => Number(b.hd) - Number(a.hd) || a.streamNo - b.streamNo,
    );
    const first = items[0]!;
    return {
      name: sourceLabel(first),
      description: first.sourceDescription ?? "",
      streams: items,
    };
  });
};

const streamButton = (stream: StreamRow) => {
  const key = streamKey(stream);
  const button = document.createElement("button");
  button.type = "button";
  button.className = `chip${key === state.activeStreamKey ? " is-active" : ""}`;
  button.disabled = state.resolving;

  const badge = document.createElement("span");
  badge.className = `chip__badge ${stream.hd ? "is-hd" : "is-sd"}`;
  badge.textContent = stream.hd ? "HD" : "SD";

  const title = document.createElement("span");
  title.className = "chip__title";
  title.textContent = `Stream ${stream.streamNo}`;

  button.append(badge, title);

  const metaParts = [
    stream.viewers > 0 ? stream.viewers.toLocaleString("en-US") : "",
    stream.language,
  ].filter(Boolean);
  if (metaParts.length) {
    const meta = document.createElement("span");
    meta.className = "chip__meta";
    meta.textContent = metaParts.join(" · ");
    button.append(meta);
  }

  button.onclick = () => void playStream(stream);
  return button;
};

const renderServers = () => {
  ui.serverCount.textContent = String(state.streams.length);
  if (!state.streams.length) {
    ui.servers.hidden = true;
    ui.servers.replaceChildren();
    ui.serversEmpty.hidden = false;
    ui.serversEmpty.textContent = state.activeMatchId
      ? "No servers for this match right now."
      : "Pick a match on the left to load servers.";
    return;
  }
  ui.serversEmpty.hidden = true;
  ui.servers.hidden = false;
  ui.servers.replaceChildren(
    ...groupBySource(state.streams).map((group) => {
      const box = document.createElement("section");
      box.className = "source";

      const head = document.createElement("div");
      head.className = "source__head";
      const name = document.createElement("h3");
      name.className = "source__name";
      name.textContent = group.name;
      const count = document.createElement("span");
      count.className = "source__count";
      count.textContent = String(group.streams.length);
      head.append(name, count);
      box.append(head);

      if (group.description) {
        const desc = document.createElement("p");
        desc.className = "source__desc";
        desc.textContent = group.description;
        box.append(desc);
      }

      const list = document.createElement("div");
      list.className = "source__list";
      list.append(...group.streams.map(streamButton));
      box.append(list);
      return box;
    }),
  );
};

const loadSports = async () => {
  const response = await fetch("/api/sports");
  const sports = (await response.json()) as Sport[];
  if (!response.ok) throw new Error("sports failed");
  state.sports = sports;
  if (state.sportId !== "all" && !sports.some((sport) => sport.id === state.sportId) && sports[0]) {
    state.sportId = sports[0].id;
  }
  renderSports();
};

const loadMatches = async () => {
  state.loading = true;
  ui.refresh.disabled = true;
  ui.status.className = "status is-loading";
  ui.liveMeta.textContent = "Loading…";
  clearError();
  renderMatches();
  try {
    const response = await fetch(`/api/matches?sport=${encodeURIComponent(state.sportId)}&scope=live`);
    const matches = (await response.json()) as Match[];
    if (!response.ok) throw new Error("matches failed");
    state.matches = Array.isArray(matches) ? matches : [];
    ui.status.className = "status";
    ui.liveMeta.textContent = feedMeta(state.matches);
  } catch (error) {
    state.matches = [];
    ui.status.className = "status is-error";
    ui.liveMeta.textContent = "Failed";
    showError(error instanceof Error ? error.message : "Live list failed");
  } finally {
    state.loading = false;
    ui.refresh.disabled = false;
    renderMatches();
  }
};

const selectMatch = async (match: Match) => {
  if (state.resolving) return;
  state.activeMatchId = match.id;
  state.activeStreamKey = null;
  clearError();
  stopPlayback();
  setIdle();
  ui.kicker.textContent = "Pick a server";
  ui.title.textContent = match.title;
  renderMatches();
  ui.status.className = "status is-loading";
  ui.liveMeta.textContent = "Streams…";
  try {
    const response = await fetch(`/api/streams?matchId=${encodeURIComponent(match.id)}`);
    const result = (await response.json()) as { streams?: StreamRow[]; error?: string };
    if (!response.ok) throw new Error(result.error ?? "streams failed");
    state.streams = result.streams ?? [];
    renderServers();
    ui.status.className = "status";
    ui.liveMeta.textContent = feedMeta(state.matches);
    if (!state.streams.length) showError("No active streams for this match right now.");
  } catch (error) {
    state.streams = [];
    renderServers();
    ui.status.className = "status is-error";
    ui.liveMeta.textContent = "Failed";
    showError(error instanceof Error ? error.message : "Streams failed");
  }
};

const playStream = async (stream: StreamRow) => {
  if (state.resolving) return;
  state.resolving = true;
  state.activeStreamKey = streamKey(stream);
  clearError();
  stopPlayback();
  setIdle();
  ui.kicker.textContent = `${sourceLabel(stream)} · ${stream.hd ? "HD" : "SD"} · Stream ${stream.streamNo}`;
  ui.title.textContent = stream.title || ui.title.textContent || "Stream";
  renderMatches();
  renderServers();
  const timing = startTiming();
  try {
    const response = await fetch("/api/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        matchId: stream.matchId ?? state.activeMatchId,
        source: stream.source,
        stream: stream.streamNo,
      }),
    });
    const result = (await response.json()) as ResolveResult;
    if (!response.ok || !result.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
    if (result.title) ui.title.textContent = result.title;
    bindExports(result);
    setPlaying();
    timing.markResolved();
    if (!result.relay) throw new Error("missing relay url");
    await startPlayback(result.relay, timing);
  } catch (error) {
    setIdle();
    ui.kicker.textContent = "Pick a server";
    ui.title.textContent = stream.title || "Choose a Match to Start";
    showError(error instanceof Error ? error.message : "Resolve failed");
  } finally {
    state.resolving = false;
    renderMatches();
    renderServers();
  }
};

document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
  button.onclick = async () => {
    const field = document.getElementById(button.dataset.copy ?? "") as HTMLInputElement | null;
    if (!field?.value) return;
    await navigator.clipboard.writeText(field.value);
    const label = button.textContent;
    button.textContent = "Copied";
    button.classList.add("ok");
    setTimeout(() => {
      button.textContent = label;
      button.classList.remove("ok");
    }, 1100);
  };
});

ui.refresh.onclick = () => void loadMatches();
setIdle();
renderServers();

void (async () => {
  try {
    await loadSports();
    await loadMatches();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Bootstrap failed");
  }
})();
