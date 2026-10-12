import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parentPort, workerData } from "node:worker_threads";
import { Window } from "happy-dom";

import { embedOrigin } from "../config/site.js";
import type { Slot } from "../types/models.js";

type LockApi = {
  init_wasm?: () => Promise<void> | void;
  set_stream_jw: (source: string, id: string, stream: string) => Promise<void>;
};

type LockModule = {
  default: (opts: {
    module_or_path: string;
    fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  }) => Promise<LockApi>;
};

type WorkerInput = { slot: Slot; goat: string; bodyHex: string };

type WasmImports = { [module: string]: { [name: string]: unknown } };

type WasmModule = {
  instantiate: (
    source: Buffer | ArrayBuffer | Uint8Array | object,
    imports?: WasmImports,
  ) => Promise<unknown>;
  instantiateStreaming?: (
    source: Response | PromiseLike<Response>,
    imports?: WasmImports,
  ) => Promise<unknown>;
};

const vendorDir = join(dirname(fileURLToPath(import.meta.url)), "vendor");
const wasmBytes = readFileSync(join(vendorDir, "lock.wasm"));
const lockModuleUrl = pathToFileURL(join(vendorDir, "lock-esm.mjs")).href;

function asBody(data: Buffer): Uint8Array {
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function pageUrl(slot: Slot): string {
  return `${embedOrigin}/embed/${slot.path}`;
}

function mountDom(slot: Slot): void {
  const window = new Window({ url: pageUrl(slot) });
  const doc = window.document;
  doc.body.innerHTML = '<div id="player"></div>';

  const jwCfg: { file: string | null } = { file: null };
  const jwBase = {
    getContainer: () => doc.getElementById("player"),
    getState: () => "idle",
    load: (cfg?: { file?: string }) => {
      if (cfg?.file) jwCfg.file = cfg.file;
    },
    setConfig: (cfg?: { file?: string }) => {
      if (cfg?.file) jwCfg.file = cfg.file;
    },
    getConfig: () => jwCfg,
    setup: () => {},
    on: () => {},
    play: () => {},
    getPlaylistItem: () => jwCfg,
    getPlaylist: () => (jwCfg.file ? [{ file: jwCfg.file }] : []),
  };

  const proxy = new Proxy(jwBase, {
    get(target, prop, receiver) {
      if (Reflect.has(target, prop)) return Reflect.get(target, prop, receiver);
      if (prop === Symbol.toStringTag) return "Object";
      return () => null;
    },
  });

  Object.assign(window, { __wasm_jw_player: proxy, jwplayer: () => proxy });

  const root = globalThis as Record<string, unknown>;
  root.window = window;
  root.document = doc;
  root.location = window.location;
  root.self = window;
  root.atob = (s: string) => Buffer.from(s, "base64").toString("binary");
  root.btoa = (s: string) => Buffer.from(s, "binary").toString("base64");

  const NativeRequest = globalThis.Request;
  const NativeUrl = globalThis.URL;

  Object.defineProperty(globalThis, "URL", {
    configurable: true,
    writable: true,
    value: class extends NativeUrl {
      constructor(input: string | URL, base?: string | URL) {
        super(input === "/fetch" ? `${embedOrigin}/fetch` : input, base ?? `${embedOrigin}/`);
      }
    },
  });

  Object.defineProperty(globalThis, "Request", {
    configurable: true,
    writable: true,
    value: class extends NativeRequest {
      constructor(input: string | URL | Request, init?: RequestInit) {
        super(input === "/fetch" ? `${embedOrigin}/fetch` : input, init);
      }
    },
  });

  Object.assign(window, {
    URL: globalThis.URL,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
  });
}

function mockFetch(
  goat: string,
  body: Buffer,
  onM3u8: (url: string) => void,
): (input: string | URL | Request, init?: RequestInit) => Promise<Response> {
  return async (input) => {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : String((input as Request).url);
    if (href.includes("lock.wasm")) {
      return new Response(asBody(wasmBytes), {
        status: 200,
        headers: { "Content-Type": "application/wasm" },
      });
    }
    if (href.includes("/fetch")) {
      return new Response(asBody(body), {
        status: 200,
        headers: { goat, "Content-Type": "application/octet-stream" },
      });
    }
    if (href.includes(".m3u8")) {
      onM3u8(href);
      return new Response("#EXTM3U\n#EXT-X-VERSION:3\n", {
        status: 200,
        headers: { "Content-Type": "application/vnd.apple.mpegurl" },
      });
    }
    return new Response("", { status: 404 });
  };
}

function patchImports(
  imports: WasmImports | undefined,
  goat: string,
  body: Buffer,
  onM3u8: (url: string) => void,
): void {
  const bg = imports?.["./locked_bg.js"];
  if (!bg) return;

  for (const key of Object.keys(bg)) {
    if (!key.includes("instanceof")) continue;
    const orig = bg[key];
    if (typeof orig !== "function") continue;
    bg[key] = (...args: unknown[]) => ((orig as (...a: unknown[]) => unknown)(...args) ? 1 : 1);
  }

  const fetchKey = Object.keys(bg).find((k) => k.includes("fetch_e6e8e0"));
  if (!fetchKey || typeof bg[fetchKey] !== "function") return;

  bg[fetchKey] = (_win: unknown, req: { url?: string }) => {
    const href = req?.url ?? "";
    if (href.includes("/fetch")) {
      return Promise.resolve(
        new Response(asBody(body), {
          status: 200,
          headers: { goat, "Content-Type": "application/octet-stream" },
        }),
      );
    }
    if (href.includes(".m3u8")) {
      onM3u8(href);
      return Promise.resolve(
        new Response("#EXTM3U\n#EXT-X-VERSION:3\n", {
          status: 200,
          headers: { "Content-Type": "application/vnd.apple.mpegurl" },
        }),
      );
    }
    return Promise.reject(new Error(`unexpected wasm fetch ${href}`));
  };
}

async function crack(slot: Slot, goat: string, bodyHex: string): Promise<string> {
  let m3u8: string | null = null;
  const body = Buffer.from(bodyHex, "hex");
  const onM3u8 = (url: string) => {
    m3u8 = url;
  };
  mountDom(slot);
  const fetchFn = mockFetch(goat, body, onM3u8);
  (globalThis as unknown as { fetch: typeof fetchFn }).fetch = fetchFn;

  const wasm = (globalThis as unknown as { WebAssembly: WasmModule }).WebAssembly;
  const origInstantiate = wasm.instantiate.bind(wasm);
  wasm.instantiate = async (source, imports) => {
    patchImports(imports, goat, body, onM3u8);
    let bytes: Buffer | ArrayBuffer | Uint8Array | object = source;
    if (!(source instanceof ArrayBuffer) && !ArrayBuffer.isView(source)) {
      bytes = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength);
    }
    return origInstantiate(bytes, imports);
  };
  wasm.instantiateStreaming = async (_resp, imports) => wasm.instantiate(wasmBytes, imports);

  const mod = (await import(lockModuleUrl)) as LockModule;
  const api = await mod.default({
    module_or_path: `${embedOrigin}/js/wasm/lock.wasm`,
    fetch: fetchFn,
  });
  await api.init_wasm?.();

  wasm.instantiate = origInstantiate;
  delete (wasm as { instantiateStreaming?: unknown }).instantiateStreaming;

  try {
    await api.set_stream_jw(slot.source, slot.id, slot.stream);
  } catch (err) {
    if (!m3u8) throw err;
  }
  if (!m3u8) throw new Error("lock did not yield m3u8");
  return m3u8;
}

const input = workerData as WorkerInput;
crack(input.slot, input.goat, input.bodyHex)
  .then((url) => parentPort?.postMessage({ ok: true, url }))
  .catch((err: unknown) =>
    parentPort?.postMessage({
      ok: false,
      error: err instanceof Error ? err.message || err.stack || "lock decrypt failed" : String(err),
    }),
  );
