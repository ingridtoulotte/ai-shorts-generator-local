// ===============================================
// jobqueue.js - persistent job queue for generation + continuation jobs.
// One job runs at a time (single GPU). Emits "update" on every change so the
// server can stream live status (SSE). Survives restarts via queue.json.
// ===============================================

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

import { config } from "./config.js";
import { runPipeline } from "./orchestrator.js";
import { continueVideo } from "./continuation.js";
import { interrupt, clearPending, freeMemory } from "./comfyClient.js";

const STORE = path.join(process.cwd(), "queue.json");
const HISTORY_KEEP = 50;

const PUBLIC = (j) => ({
  id: j.id, type: j.type, status: j.status, priority: j.priority,
  label: j.label, params: j.params, progress: j.progress, error: j.error,
  result: j.result, attempts: j.attempts, createdAt: j.createdAt,
  startedAt: j.startedAt, finishedAt: j.finishedAt,
});

export class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = [];
    this.paused = false;
    this.running = null;        // currently running job
    this.durations = [];        // recent completed durations (ms) for ETA
    this._processing = false;
    this._load();
  }

  // ---- persistence ----
  _load() {
    try {
      const data = JSON.parse(fs.readFileSync(STORE, "utf8"));
      this.jobs = (data.jobs || []).map((j) => {
        if (j.status === "running") { j.status = "waiting"; j.progress = { pct: 0, stage: "queued" }; }
        return j;
      });
      this.durations = data.durations || [];
    } catch { this.jobs = []; }
  }
  _save() {
    try {
      fs.writeFileSync(STORE, JSON.stringify({ jobs: this.jobs.map(PUBLIC), durations: this.durations }, null, 2));
    } catch (e) { console.warn("queue persist failed:", e.message); }
  }
  _changed() { this._save(); this.emit("update", this.snapshot()); }

  // ---- public state ----
  snapshot() {
    const avg = this.avgMs();
    let ahead = 0;
    const waiting = this._waitingOrder();
    const etaById = {};
    for (const j of waiting) { etaById[j.id] = Math.round((ahead * avg) / 1000); ahead++; }
    return {
      paused: this.paused,
      avgSec: Math.round(avg / 1000),
      jobs: this.jobs.map((j) => ({ ...PUBLIC(j), etaSec: etaById[j.id] ?? 0 })),
    };
  }
  avgMs() {
    if (!this.durations.length) return 180000; // 3 min default guess
    return this.durations.reduce((a, b) => a + b, 0) / this.durations.length;
  }
  _waitingOrder() {
    return this.jobs
      .filter((j) => j.status === "waiting")
      .sort((a, b) => (b.priority - a.priority) || (a.order - b.order));
  }

  // ---- mutations ----
  add({ type = "generate", params = {}, label, priority = 0 }) {
    const id = "job_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const job = {
      id, type, params, label: label || params.idea || type,
      status: "waiting", priority, order: this._nextOrder(), attempts: 0,
      progress: { pct: 0, stage: "queued" }, error: null, result: null,
      createdAt: Date.now(), startedAt: null, finishedAt: null,
    };
    this.jobs.push(job);
    this._changed();
    this._tick();
    return PUBLIC(job);
  }
  _nextOrder() { return (this.jobs.reduce((m, j) => Math.max(m, j.order || 0), 0)) + 1; }

  get(id) { return this.jobs.find((j) => j.id === id); }

  remove(id) {
    const j = this.get(id);
    if (!j) return false;
    if (j.status === "running") return this.cancel(id);
    this.jobs = this.jobs.filter((x) => x.id !== id);
    this._changed();
    return true;
  }

  cancel(id) {
    const j = this.get(id);
    if (!j) return false;
    if (j.status === "running") {
      j._cancel = true;
      interrupt(); clearPending();
    } else if (j.status === "waiting") {
      j.status = "cancelled"; j.finishedAt = Date.now();
    } else return false;
    this._changed();
    return true;
  }

  cancelAll() {
    for (const j of this.jobs) {
      if (j.status === "running") { j._cancel = true; }
      else if (j.status === "waiting") { j.status = "cancelled"; j.finishedAt = Date.now(); }
    }
    interrupt(); clearPending();
    this._changed();
    return true;
  }

  clearFinished() {
    this.jobs = this.jobs.filter((j) => !["completed", "failed", "cancelled"].includes(j.status) || j.status === "running");
    this._changed();
    return true;
  }

  setPriority(id, priority) {
    const j = this.get(id);
    if (!j || j.status !== "waiting") return false;
    j.priority = Number(priority) || 0;
    this._changed();
    return true;
  }

  // Move a waiting job up/down in its priority band.
  reorder(id, direction) {
    const order = this._waitingOrder();
    const idx = order.findIndex((j) => j.id === id);
    if (idx < 0) return false;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= order.length) return false;
    const a = order[idx], b = order[swapWith];
    if (a.priority !== b.priority) { a.priority = b.priority; } // jump bands first
    else { const t = a.order; a.order = b.order; b.order = t; }
    this._changed();
    return true;
  }

  pause() { this.paused = true; this._changed(); }
  resume() { this.paused = false; this._changed(); this._tick(); }

  // ---- processing ----
  _tick() { if (!this._processing) this._loop().catch((e) => console.error("queue loop:", e)); }

  async _loop() {
    this._processing = true;
    try {
      while (!this.paused) {
        const next = this._waitingOrder()[0];
        if (!next) break;
        await this._run(next);
      }
    } finally {
      this._processing = false;
    }
  }

  async _run(job) {
    job.status = "running"; job.startedAt = Date.now(); job._cancel = false;
    job.progress = { pct: 1, stage: "starting" };
    this.running = job;
    this._changed();

    const isCancelled = () => job._cancel === true;
    let lastEmit = 0;
    const onProgress = (p) => {
      job.progress = { pct: p.pct ?? job.progress.pct, stage: p.stage || job.progress.stage, ...p };
      const now = Date.now();
      if (now - lastEmit > 500) { lastEmit = now; this.emit("update", this.snapshot()); }
    };

    try {
      let result;
      if (job.type === "continue") {
        result = await continueVideo({ ...job.params, jobId: job.id, isCancelled, onProgress });
      } else {
        result = await runPipeline(job.params.idea, { ...job.params, jobId: job.id, isCancelled, onProgress });
      }
      job.result = { videoUrl: `/output/${path.basename(result.videoPath)}`, ...(result.script ? { script: result.script } : {}) };
      job.status = "completed";
      job.progress = { pct: 100, stage: "done" };
      this.durations.push(Date.now() - job.startedAt);
      if (this.durations.length > 10) this.durations.shift();
    } catch (err) {
      if (err.cancelled || job._cancel) {
        job.status = "cancelled";
        await freeMemory();
        this._cleanupTemp(job.id);
      } else {
        job.attempts += 1;
        const maxRetries = config.maxRetries ?? 2;
        if (job.attempts <= maxRetries) {
          console.warn(`[queue] job ${job.id} failed (try ${job.attempts}/${maxRetries}) -> requeue: ${err.message.split("\n")[0]}`);
          job.status = "waiting"; job.progress = { pct: 0, stage: `retry ${job.attempts}` };
          this.running = null; this._changed();
          return;
        }
        job.status = "failed"; job.error = err.message.split("\n")[0];
      }
    } finally {
      job.finishedAt = Date.now();
      this.running = null;
      this._trimHistory();
      this._changed();
    }
  }

  _cleanupTemp(jobId) {
    try { fs.rmSync(path.join(config.tmpDir, jobId), { recursive: true, force: true }); } catch {}
    try { fs.rmSync(path.join(config.audioDir, jobId), { recursive: true, force: true }); } catch {}
  }

  _trimHistory() {
    const finished = this.jobs.filter((j) => ["completed", "failed", "cancelled"].includes(j.status));
    if (finished.length > HISTORY_KEEP) {
      const drop = new Set(finished.slice(0, finished.length - HISTORY_KEEP).map((j) => j.id));
      this.jobs = this.jobs.filter((j) => !drop.has(j.id));
    }
  }
}

export const queue = new JobQueue();
export default queue;
