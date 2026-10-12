import { Worker } from "node:worker_threads";

import type { Slot } from "../types/models.js";

type WorkerMsg = { ok: true; url: string } | { ok: false; error: string };

export function unlock(slot: Slot, goat: string, body: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./lock-worker.js", import.meta.url), {
      workerData: { slot, goat, bodyHex: body.toString("hex") },
    });
    worker.once("message", (msg: WorkerMsg) => {
      void worker.terminate();
      if (msg.ok) resolve(msg.url);
      else reject(new Error(msg.error || "lock decrypt failed"));
    });
    worker.once("error", (err) => {
      void worker.terminate();
      reject(err);
    });
  });
}
