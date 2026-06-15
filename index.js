// ===============================================
// index.js - AI Shorts Generator (Wan 2.2) server
// Queue-driven local pipeline: idea -> script -> FLUX2+Wan2.2 -> TTS -> video,
// plus continuation/extension, cancellation, and a live status stream.
// ===============================================

import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { queue } from "./pipeline/jobqueue.js";
import { systemStats } from "./pipeline/comfyClient.js";
import { config } from "./pipeline/config.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

for (const d of ["output", "audio", "logs", "tmp"]) {
  const dir = path.join(process.cwd(), d);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/output", express.static(config.outputDir));

// ---- meta ----
app.get("/api/health", (req, res) => res.json({ ok: true, engine: config.engine, time: new Date().toISOString() }));
app.get("/api/voices", (req, res) => res.json([
  { id: "fr", label: "Francais" }, { id: "en", label: "English" }, { id: "es", label: "Espanol" },
]));

// VRAM / GPU monitor (proxies ComfyUI; degrades gracefully if it's down).
app.get("/api/stats", async (req, res) => {
  try {
    const s = await systemStats();
    const dev = (s.devices || [])[0] || {};
    res.json({
      ok: true,
      gpu: dev.name || "GPU",
      vramTotal: dev.vram_total || 0,
      vramFree: dev.vram_free || 0,
      vramUsed: (dev.vram_total || 0) - (dev.vram_free || 0),
    });
  } catch {
    res.json({ ok: false, gpu: "ComfyUI offline" });
  }
});

// ---- queue ----
app.get("/queue", (req, res) => res.json(queue.snapshot()));

app.post("/generate", (req, res) => {
  const idea = (req.body?.idea ?? req.body?.prompt ?? "").toString().trim();
  if (!idea) return res.status(400).json({ error: "Pas de texte fourni" });
  const params = {
    idea,
    voice: (req.body?.voice ?? "fr").toString(),
    durationSec: Number(req.body?.duration) || 30,
    audioMode: (req.body?.audioMode ?? "C").toString(),
    style: req.body?.style ? String(req.body.style) : undefined,
  };
  const job = queue.add({ type: "generate", params, label: idea, priority: Number(req.body?.priority) || 0 });
  res.json({ jobId: job.id, job });
});

app.post("/continue", (req, res) => {
  const seedUrl = (req.body?.seedVideoUrl || "").toString();
  if (!seedUrl) return res.status(400).json({ error: "seedVideoUrl requis" });
  const seedVideoPath = path.join(config.outputDir, path.basename(seedUrl));
  if (!fs.existsSync(seedVideoPath)) return res.status(404).json({ error: "video source introuvable" });
  const params = {
    seedVideoPath,
    idea: (req.body?.idea || "seamless continuation of the previous shot").toString(),
    segments: Number(req.body?.segments) || 1,
    segDurationSec: Number(req.body?.segDurationSec) || 5,
    smooth: Boolean(req.body?.smooth),
    prependSeed: req.body?.prependSeed !== false,
  };
  const job = queue.add({ type: "continue", params, label: `+${params.segments} seg · ${params.idea}`, priority: Number(req.body?.priority) || 0 });
  res.json({ jobId: job.id, job });
});

app.post("/queue/pause", (req, res) => { queue.pause(); res.json({ ok: true }); });
app.post("/queue/resume", (req, res) => { queue.resume(); res.json({ ok: true }); });
app.post("/queue/cancel-all", (req, res) => { queue.cancelAll(); res.json({ ok: true }); });
app.post("/queue/clear-finished", (req, res) => { queue.clearFinished(); res.json({ ok: true }); });
app.post("/queue/:id/cancel", (req, res) => res.json({ ok: queue.cancel(req.params.id) }));
app.post("/queue/:id/remove", (req, res) => res.json({ ok: queue.remove(req.params.id) }));
app.post("/queue/:id/priority", (req, res) => res.json({ ok: queue.setPriority(req.params.id, req.body?.priority) }));
app.post("/queue/:id/reorder", (req, res) => res.json({ ok: queue.reorder(req.params.id, req.body?.direction) }));

// ---- live status stream (SSE) ----
app.get("/events", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.flushHeaders?.();
  const send = (snap) => res.write(`data: ${JSON.stringify(snap)}\n\n`);
  send(queue.snapshot());
  const onUpdate = (snap) => send(snap);
  queue.on("update", onUpdate);
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => { clearInterval(ping); queue.off("update", onUpdate); });
});

app.listen(PORT, () => console.log(`AI Shorts Generator (Wan 2.2) on http://localhost:${PORT}  [engine=${config.engine}]`));
