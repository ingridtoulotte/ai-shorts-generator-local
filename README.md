# 🎬 AI Shorts Generator

Generate vertical **YouTube Shorts / TikTok** videos locally: idea → script → voice-over → captioned 1080×1920 MP4.

Runs **100% locally on Windows** with **no API keys required**:
- **Script**: local generator (optional Groq if `GROQ_API_KEY` set)
- **Voice**: Windows SAPI text-to-speech (offline)
- **Video**: bundled `ffmpeg-static` (no system install needed)

## Requirements
- Node.js >= 20
- Windows (for the offline SAPI voice). Optional: `GROQ_API_KEY` / `PLAYAI_API_KEY` for cloud quality.

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000 — type an idea, pick a voice and duration, click **Générer**.
The finished video plays in the page and is saved under `output/`.

## Test the full pipeline (no server)
```bash
npm test
```
Generates a script, a WAV voice-over and an MP4, asserting each step.

## API
- `GET  /` — web UI
- `POST /generate` — body `{ "idea": "...", "voice": "fr|fr-female|en|es", "duration": 20 }` → `{ "videoUrl": "/output/<id>.mp4", "script": "..." }`
- `GET  /api/voices` — available voices
- `GET  /api/health` — health check

## Optional cloud upgrades (.env)
Copy `.env.example` to `.env`:
- `GROQ_API_KEY` — use Groq LLM for the script
- `PLAYAI_API_KEY` — use PlayAI for the voice

## Deploy (Render)
`npm run render` runs `start-server.sh` (Linux). On Linux there is no SAPI, so set
`PLAYAI_API_KEY` for TTS. Build: `npm install` · Start: `bash ./start-server.sh`.

## Project layout
- `index.js` — Express server + pipeline wiring
- `groq.js` — script generation (local / Groq)
- `tts.js` — text-to-speech (SAPI / PlayAI)
- `video.js` — ffmpeg render (1080×1920, captions)
- `public/index.html` — web UI
- `test/smoke.js` — end-to-end test
