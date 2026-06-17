# Changelog

## [5.0.0] — 2026-06-17

Frontend excellence + launch credibility: a TypeScript UI rewrite, Real-ESRGAN,
acoustic match, named audio modes, diagrams and demo GIFs.

### Added
- **TypeScript UI rewrite** (`frontend/`, Vite + strict TS): component architecture
  (`components/` · `panels/` · `stores/` · `services/` · `utils/`), reusable
  primitives, a tiny reactive store. Premium SaaS layout — collapsible sidebar nav,
  workspace with empty state, hideable info panel (VRAM/GPU, animated pipeline,
  live logs), creator queue cards (thumbnail, status colors, reorder/duplicate/retry/edit),
  History, Presets, Assets, Settings, About. Responsive + mobile drawer.
  `npm run build` → `dist/` (served by the backend); `npm run ui:dev` for Vite dev.
- **Real-ESRGAN upscale** (`pipeline/upscale.js`): optional 2× / 4× output upscale
  (frames → ncnn model → re-mux audio), ffmpeg-lanczos fallback; carried continuation
  frames now Real-ESRGAN-upscaled. `/api/upscale-estimate` for live VRAM/time/resolution.
- **Acoustic match** (`pipeline/acoustic.js`): continuation segments are loudness-matched
  to the seed clip (two-pass EBU R128 loudnorm) so extensions sound like the same video.
- **Named audio modes** (`pipeline/audioModes.js`): 🎙 Full Narration · 🔊 Full SFX ·
  🎬 Narration + SFX (legacy `A/B/C/D` still accepted). `/api/capabilities` exposes them.
- **Architecture diagrams** (`docs/architecture-{dark,light}.svg`) and **demo GIFs** (`docs/`).
- **CI** (`.github/workflows/ci.yml`, windows-latest): type-check, UI build, stub
  pipeline + queue tests on every push.

### Verified
- Real-ESRGAN 1080×1920 → 2160×3840 per frame; acoustic match within ~0.1 LU;
  UI builds to a ~24 KB JS bundle and renders/mounts headless; stub batch + queue ALLPASS.

## [4.0.0] — 2026-06-15

A studio-grade upgrade: queue, cancellation, continuation, new UI.

### Added
- **Persistent prompt queue** (`pipeline/jobqueue.js`): priority, ↑/↓ reorder,
  ETA, automatic retry, restart persistence (`queue.json`), statuses
  (waiting/running/completed/failed/cancelled), live updates over SSE.
- **Running-batch cancellation**: ComfyUI `/interrupt` + queue clear + VRAM
  `/free` + temp cleanup; cancellation never retries.
- **Continuation / extension** (`pipeline/continuation.js`): last frame → 2×
  upscale → Wan 2.2 I2V → seamless stitch; `+1/+3/+5/+10` segments; optional
  motion-interpolated seams.
- **Redesigned UI**: dark/light/compact themes, live queue panel, progress bars,
  VRAM/GPU monitor, preview + download, presets, prompt history.
- **stub backend** (`GEN_ENGINE=stub`) + `test/queue_test.mjs` for GPU-free CI.
- Server endpoints: `/queue*`, `/continue`, `/events` (SSE), `/api/stats`.

### Changed
- Server is queue-driven; `/generate` now enqueues a job and returns its id.
- `renderScene` guarantees an audio track (real or silent) so concat never fails.

### Verified
- Real Wan 2.2: en/10s → 10.07 s, fr/18s → 18.00 s, 1080×1920 with voice-over;
  queue, cancellation (waiting + running) and continuation all pass.

## [3.x]
- Local FLUX2 + Wan 2.2 pipeline; language-matched narration + voice + subtitles;
  exact-duration fit; polished single-page UI.
