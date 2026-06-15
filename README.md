# 🎬 AI Shorts Studio — Wan 2.2

**A fully-local, queue-driven AI short-video studio.** Type an idea → get a
captioned vertical 9:16 short, produced entirely on your own machine. No cloud,
no API keys, no upload of your prompts.

Powered by **FLUX2** (establishing image) → **Wan 2.2** image-to-video in
ComfyUI, an **Ollama** LLM for scripting (with an offline fallback), **Windows
SAPI** for voice-over, and **ffmpeg** for assembly.

> Sister project: **[AI Shorts Studio — LTX 2.3](https://github.com/ingridtoulotte/ai-shorts-generator-local-ltx)** (LTX 2.3 image-to-video with native audio, no subtitles).

---

## ✨ Highlights

- **Prompt queue** — stack many jobs; they run one-by-one. Priority, reordering,
  ETA, automatic retry, restart-persistent (`queue.json`), live status
  (waiting / running / completed / failed / cancelled).
- **Reliable cancellation** — stop a running batch instantly: ComfyUI is
  interrupted, VRAM freed, temp files cleaned — no reboot, no corrupt output.
- **Continuation / extension** — extend any clip: last frame → 2× upscale →
  Wan 2.2 image-to-video → seamless stitch. One-click **+1 / +3 / +5 / +10
  segments**, optional motion-interpolated seams.
- **Language-matched** — script, **voice-over and subtitles** all follow the
  chosen language (FR / EN / ES). **Exact duration** — output length matches the
  requested length (script sized to a word budget + final time-stretch, never
  cuts words).
- **Pro UI** — glassmorphism, dark/light/compact, live queue panel, progress
  bars, **VRAM/GPU monitor**, preview + download, presets, prompt history.

---

## 🧱 Architecture

```
                 ┌──────────────┐
  idea  ───────▶ │  scriptgen   │  Ollama (gemma) → offline fallback
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐
                 │ sceneplanner │  split into 3–8 visual scenes
                 └──────┬───────┘
                        ▼
                 ┌──────────────┐
                 │ promptAdapter│  scene → generation-ready prompt
                 └──────┬───────┘
                        ▼
       ┌──────── per scene ─────────┐
       │ FLUX2 t2i → Wan 2.2 I2V     │  ComfyUI
       │ + SAPI voice-over           │
       │ (or continuation frame)     │
       └──────┬─────────────────────┘
              ▼
       render (scale/crop 1080×1920 + caption burn-in) → concat
            → exact-duration fit → .mp4

  jobqueue.js drives all of the above, one job at a time, with cancellation,
  retry, persistence and live SSE status. continuation.js chains segments.
```

Every stage is a small module under `pipeline/`. Swap the engine with
`GEN_ENGINE` (`wan` | `stub`).

---

## 📦 Requirements

- **Node.js ≥ 20**, **Windows** (for SAPI voice-over).
- **ComfyUI** running locally (default `http://127.0.0.1:8188`) with the FLUX2
  and Wan 2.2 I2V camera models/LoRAs installed (workflows in
  `pipeline/workflows/`).
- **Ollama** (optional, default `http://127.0.0.1:11434`) for higher-quality
  scripts; without it a deterministic localized fallback is used.
- **ffmpeg** is bundled via `ffmpeg-static`.

---

## 🚀 Install & run

```bash
git clone https://github.com/ingridtoulotte/ai-shorts-generator-local
cd ai-shorts-generator-local
npm install
npm start                      # http://localhost:3000
```

Open the UI, type an idea, pick voice / duration, **Add to queue**. Watch
progress live; preview and download when done; **Continue this** to extend it.

GPU-free dry run (color clips, no ComfyUI): `GEN_ENGINE=stub npm start`.

---

## 🔌 API

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/generate` | enqueue `{idea, voice, duration, priority}` |
| `POST` | `/continue` | enqueue extension `{seedVideoUrl, idea, segments, segDurationSec, smooth}` |
| `GET`  | `/queue` | queue snapshot |
| `POST` | `/queue/:id/cancel` · `/remove` · `/reorder` · `/priority` | per-job control |
| `POST` | `/queue/pause` · `/resume` · `/cancel-all` · `/clear-finished` | queue control |
| `GET`  | `/events` | Server-Sent Events live status stream |
| `GET`  | `/api/stats` | VRAM / GPU snapshot (via ComfyUI) |

---

## ⚙️ Configuration (env)

`GEN_ENGINE`, `COMFYUI_URL`, `COMFYUI_DIR`, `OLLAMA_URL`, `LLM_MODEL`,
`VIDEO_FPS`, `GEN_WIDTH`/`GEN_HEIGHT`, `OUT_WIDTH`/`OUT_HEIGHT`,
`MIN_SCENES`/`MAX_SCENES`, `SPEECH_WPS`, `DURATION_TOLERANCE_SEC`. See
`pipeline/config.js`.

---

## 🧪 Testing

```bash
# Whole pipeline, GPU-free (color clips + real script/TTS logic):
GEN_ENGINE=stub node test/batch_test.mjs
# Queue, cancellation (waiting + running) and continuation, GPU-free:
GEN_ENGINE=stub OLLAMA_URL=http://127.0.0.1:1 STUB_DELAY_MS=2500 node test/queue_test.mjs
```

Verified with real generation: en/10s → 10.07s, fr/18s → 18.00s, 1080×1920 with
voice-over, exact duration; queue + cancellation + continuation all pass.

---

## 🛟 Troubleshooting

- **ComfyUI offline** → VRAM monitor shows "offline"; start ComfyUI on `:8188`.
- **Wrong language voice** → the voice selector also sets the script language;
  FR/EN/ES map to the matching SAPI voice (Paul/Hortense, Zira, Helena).
- **Job stuck** → click **⏹ stop** (interrupts ComfyUI and frees VRAM), then retry.
- **No SAPI voice on non-Windows** → set a PlayAI key or run the LTX sister project.

---

## 🗺️ Roadmap

- True drag-and-drop queue reordering (today: reliable ↑/↓ controls).
- Real-ESRGAN continuation upscaler option (today: lanczos 2×).
- Multi-GPU scheduling (today: single-GPU, one job at a time).
- Architecture diagram image + demo GIFs.

---

## 📜 License & credits

MIT. Built on the structure of `theot44240-tech/Ai-video-generator`, rebuilt
into a fully-local, queue-driven studio. ffmpeg via `ffmpeg-static`;
generation via ComfyUI + FLUX2 + Wan 2.2.
