# Changelog

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
