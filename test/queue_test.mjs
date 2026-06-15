// ===============================================
// queue_test.mjs - headless test of the queue, cancellation and continuation.
// Run with: GEN_ENGINE=stub OLLAMA_URL=http://127.0.0.1:1 STUB_DELAY_MS=2500 node test/queue_test.mjs
// ===============================================
import path from "path";
import { queue } from "../pipeline/jobqueue.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 180000) {
  const t = Date.now();
  while (Date.now() - t < timeout) { if (fn()) return true; await wait(400); }
  return false;
}
const J = (id) => queue.snapshot().jobs.find((j) => j.id === id);
let fails = 0;
const check = (name, ok, extra = "") => { console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${extra ? " — " + extra : ""}`); if (!ok) fails++; };

console.log("\n=== queue_test ===\n");

// 1) two jobs complete in order
const a = queue.add({ type: "generate", params: { idea: "discipline beats motivation", voice: "en", durationSec: 6, audioMode: "C" } });
const b = queue.add({ type: "generate", params: { idea: "la magie du cosmos", voice: "fr", durationSec: 6 } });
const both = await until(() => J(a.id)?.status === "completed" && J(b.id)?.status === "completed");
check("two jobs complete", both, `${J(a.id)?.status}/${J(b.id)?.status}`);
check("result has videoUrl", !!J(a.id)?.result?.videoUrl, J(a.id)?.result?.videoUrl);

// 2) waiting-cancel (deterministic): pause, add, cancel while waiting
queue.pause();
const c = queue.add({ type: "generate", params: { idea: "cancel me waiting", voice: "en", durationSec: 6 } });
await wait(200);
queue.cancel(c.id);
check("waiting job cancelled", J(c.id)?.status === "cancelled");
queue.resume();

// 3) running-cancel: long job (STUB_DELAY_MS), cancel after it starts
const d = queue.add({ type: "generate", params: { idea: "cancel me running", voice: "en", durationSec: 8 } });
await until(() => J(d.id)?.status === "running", 30000);
await wait(800);
queue.cancel(d.id);
const cancelledRunning = await until(() => J(d.id)?.status === "cancelled", 30000);
check("running job cancelled", cancelledRunning, J(d.id)?.status);

// 4) continuation from a completed clip
const seedUrl = J(a.id).result.videoUrl;            // /output/<id>.mp4
const seedVideoPath = path.join(process.cwd(), "output", path.basename(seedUrl));
const e = queue.add({ type: "continue", params: { seedVideoPath, idea: "keep building the road", segments: 2, segDurationSec: 4, prependSeed: true } });
const contOk = await until(() => ["completed", "failed"].includes(J(e.id)?.status), 180000);
check("continuation completes", contOk && J(e.id)?.status === "completed", J(e.id)?.status + (J(e.id)?.error ? " · " + J(e.id).error : ""));
check("continuation has output", !!J(e.id)?.result?.videoUrl, J(e.id)?.result?.videoUrl);

// 5) persistence file exists
import fs from "fs";
check("queue.json persisted", fs.existsSync(path.join(process.cwd(), "queue.json")));

console.log(`\n=== ${fails === 0 ? "ALL PASS" : fails + " FAILED"} ===`);
process.exit(fails ? 1 : 0);
