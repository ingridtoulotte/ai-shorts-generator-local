// ===============================================
// config.js - central configuration for the local pipeline
// ===============================================

import path from "path";
import os from "os";

function num(name, def) {
  const v = process.env[name];
  return v ? Number(v) : def;
}

export const config = {
  // --- Local services ---
  ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
  llmModel: process.env.LLM_MODEL || "gemma4",

  comfyUrl: process.env.COMFYUI_URL || "http://127.0.0.1:8188",
  comfyDir: process.env.COMFYUI_DIR || "D:\\IA_PROJET\\System\\ComfyUI",

  // --- Generation engine: "wan" (proven, FLUX2+Wan2.2) or "ltx" (LTX 2.3, native audio) ---
  engine: process.env.GEN_ENGINE || "wan",

  // --- Video output ---
  fps: num("VIDEO_FPS", 16),
  // Generation resolution (portrait, kept modest for speed; upscaled at render time).
  genWidth: num("GEN_WIDTH", 480),
  genHeight: num("GEN_HEIGHT", 832),
  // Final output resolution (YouTube Shorts / TikTok).
  outWidth: num("OUT_WIDTH", 1080),
  outHeight: num("OUT_HEIGHT", 1920),

  // --- Scene planning ---
  minScenes: num("MIN_SCENES", 3),
  maxScenes: num("MAX_SCENES", 8),

  // --- Narration timing ---
  // Word budget used to size the script to the requested duration.
  speechWordsPerSec: num("SPEECH_WPS", 2.0),
  // If the assembled video is off the requested duration by more than this,
  // the final clip is time-stretched (audio + video) to match it exactly.
  durationToleranceSec: num("DURATION_TOLERANCE_SEC", 0.75),

  // --- Directories ---
  outputDir: path.join(process.cwd(), "output"),
  audioDir: path.join(process.cwd(), "audio"),
  logsDir: path.join(process.cwd(), "logs"),
  tmpDir: path.join(process.cwd(), "tmp"),

  // --- Real-ESRGAN upscaling (final-output + continuation carried frame) ---
  // Uses the realesrgan-ncnn-vulkan binary; the Upscayl build is auto-detected.
  // Override with REALESRGAN_BIN / REALESRGAN_MODELS / REALESRGAN_MODEL.
  // Missing binary/model -> pipeline silently falls back to ffmpeg lanczos.
  upscale: {
    bin: process.env.REALESRGAN_BIN ||
      (os.platform() === "win32"
        ? "C:\\Program Files\\Upscayl\\resources\\bin\\upscayl-bin.exe"
        : "realesrgan-ncnn-vulkan"),
    modelDir: process.env.REALESRGAN_MODELS ||
      (os.platform() === "win32" ? "C:\\Program Files\\Upscayl\\resources\\models" : "models"),
    model: process.env.REALESRGAN_MODEL || "upscayl-standard-4x",
    gpuId: process.env.REALESRGAN_GPU != null ? Number(process.env.REALESRGAN_GPU) : null,
  },

  // --- Robustness ---
  comfyTimeoutMs: num("COMFY_TIMEOUT_MS", 600000), // 10 min per generation job
  comfyPollMs: num("COMFY_POLL_MS", 2000),
  maxRetries: num("GEN_MAX_RETRIES", 2),
};

export function comfyInputDir() {
  return path.join(config.comfyDir, "input");
}

export function comfyOutputDir() {
  return path.join(config.comfyDir, "output");
}

export default config;
