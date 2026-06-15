// ===============================================
// index.js - AI Shorts Generator (main server)
// Fully local pipeline: idea -> script -> TTS -> video
// ===============================================

import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

import { runPipeline } from "./pipeline/orchestrator.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure runtime dirs exist.
for (const d of ["output", "audio", "logs"]) {
  const dir = path.join(process.cwd(), d);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/output", express.static(path.join(process.cwd(), "output")));

// Health check.
app.get("/api/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Available voices (used by frontend if it asks; safe defaults).
app.get("/api/voices", (req, res) => {
  res.json([
    { id: "fr", label: "Francais (Homme)" },
    { id: "fr-female", label: "Francais (Femme)" },
    { id: "en", label: "English" },
    { id: "es", label: "Espanol" },
  ]);
});

// Main pipeline: idea -> script -> scenes -> prompts -> local generation -> render.
app.post("/generate", async (req, res) => {
  const idea = (req.body?.idea ?? req.body?.prompt ?? "").toString().trim();
  const voice = (req.body?.voice ?? "fr").toString();
  const durationSec = Number(req.body?.duration) || 30;
  const style = req.body?.style ? String(req.body.style) : undefined;

  if (!idea) return res.status(400).json({ error: "Pas de texte fourni" });

  const id = uuidv4();
  try {
    const { videoPath, script } = await runPipeline(idea, { durationSec, voice, style, jobId: id });
    const videoUrl = `/output/${path.basename(videoPath)}`;
    console.log(`[${id}] Done -> ${videoUrl}`);
    res.json({ videoUrl, url: videoUrl, script });
  } catch (err) {
    console.error(`[${id}] ERROR:`, err);
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

app.listen(PORT, () => console.log(`AI Shorts Generator running on http://localhost:${PORT}`));
