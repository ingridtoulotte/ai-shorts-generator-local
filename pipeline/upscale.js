// ===============================================
// upscale.js - Real-ESRGAN video/image upscaling.
// Uses the realesrgan-ncnn-vulkan binary (Upscayl build) when available:
// frames are extracted, batch-upscaled by the model, then re-muxed with the
// original audio. Falls back to ffmpeg lanczos when the binary/model is absent,
// so the pipeline never hard-fails on a machine without Real-ESRGAN installed.
// ===============================================

import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";

import { config } from "./config.js";
import { CancelledError } from "./comfyClient.js";

const execFileAsync = util.promisify(execFile);
const FFMPEG = ffmpegStatic;

function up() { return config.upscale || {}; }

// True when a usable Real-ESRGAN binary + model are present on disk.
export function realesrganAvailable() {
  const u = up();
  try {
    if (!u.bin || !fs.existsSync(u.bin)) return false;
    if (!u.modelDir || !fs.existsSync(u.modelDir)) return false;
    return fs.existsSync(path.join(u.modelDir, `${u.model}.param`));
  } catch { return false; }
}

// Human-readable engine label for logs / UI.
export function upscalerLabel() {
  return realesrganAvailable() ? `Real-ESRGAN (${up().model})` : "ffmpeg lanczos";
}

// Predict output resolution / rough VRAM + time for a given input + scale.
// Used by the UI to show "expected output" before a job runs.
export function estimateUpscale({ width, height, scale = 2, frames = 0, fps = 16 }) {
  const s = Number(scale) || 1;
  const ow = Math.round((width || 0) * s);
  const oh = Math.round((height || 0) * s);
  const real = realesrganAvailable();
  // Real-ESRGAN ~0.4s/frame at 1080p on a mid GPU; lanczos is near-instant.
  const perFrame = real ? 0.4 * Math.max(1, s / 2) : 0.01;
  const seconds = Math.round((frames || fps * 5) * perFrame);
  // ncnn keeps ~1.5-3GB resident depending on tile size.
  const vramGB = real ? Math.min(8, 1.5 + (ow * oh) / 4_000_000) : 0;
  return {
    engine: real ? "realesrgan" : "lanczos",
    outWidth: ow, outHeight: oh,
    estSeconds: seconds,
    estVramGB: Number(vramGB.toFixed(1)),
  };
}

// Probe a media file's width/height via ffmpeg stderr (no ffprobe dependency).
async function probeSize(file) {
  try { await execFileAsync(FFMPEG, ["-i", file], { windowsHide: true }); }
  catch (e) {
    const m = /, (\d{2,5})x(\d{2,5})/.exec(e.stderr || "");
    if (m) return { width: +m[1], height: +m[2] };
  }
  return { width: config.outWidth, height: config.outHeight };
}

// Run the Real-ESRGAN binary over an input dir (or single file) -> output dir/file.
async function runRealesrgan(inPath, outPath, scale) {
  const u = up();
  const args = ["-i", inPath, "-o", outPath, "-s", String(scale), "-m", u.modelDir, "-n", u.model, "-f", "png"];
  if (u.gpuId != null) args.push("-g", String(u.gpuId));
  await execFileAsync(u.bin, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 64 });
}

/**
 * upscaleImage - upscale a single image. Real-ESRGAN if available, else lanczos.
 * @returns {Promise<string>} outPath
 */
export async function upscaleImage(inPath, outPath, { scale = 2 } = {}) {
  if (realesrganAvailable()) {
    await runRealesrgan(inPath, outPath, scale);
  } else {
    await execFileAsync(FFMPEG, ["-y", "-i", inPath, "-vf", `scale=iw*${scale}:ih*${scale}:flags=lanczos`, outPath],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 64 });
  }
  if (!fs.existsSync(outPath)) throw new Error(`Upscale image echoue: ${inPath}`);
  return outPath;
}

/**
 * upscaleVideo - upscale a finished mp4 by `scale` (2 or 4), preserving audio + duration.
 * Real-ESRGAN path: frames -> batch upscale -> re-encode + original audio.
 * Lanczos fallback: single ffmpeg scale pass (fast).
 * @param {{scale:number, isCancelled?:()=>boolean, onProgress?:(p)=>void}} opts
 * @returns {Promise<string>} outPath (the upscaled file)
 */
export async function upscaleVideo(inPath, outPath, opts = {}) {
  const scale = Number(opts.scale) || 2;
  if (scale <= 1) { fs.copyFileSync(inPath, outPath); return outPath; }
  const isCancelled = opts.isCancelled || (() => false);
  const onProgress = opts.onProgress || (() => {});
  const guard = () => { if (isCancelled()) throw new CancelledError("upscale annule"); };

  // Lanczos fallback: one ffmpeg pass, keep audio.
  if (!realesrganAvailable()) {
    onProgress({ stage: "upscaling", pct: 95, engine: "lanczos" });
    await execFileAsync(FFMPEG, ["-y", "-i", inPath,
      "-vf", `scale=iw*${scale}:ih*${scale}:flags=lanczos`,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-b:v", "8M",
      "-c:a", "copy", outPath], { windowsHide: true, maxBuffer: 1024 * 1024 * 128 });
    if (!fs.existsSync(outPath)) throw new Error(`Upscale lanczos echoue: ${inPath}`);
    return outPath;
  }

  // Real-ESRGAN per-frame path.
  const work = path.join(config.tmpDir, `up_${Date.now().toString(36)}`);
  const framesIn = path.join(work, "in");
  const framesOut = path.join(work, "out");
  fs.mkdirSync(framesIn, { recursive: true });
  fs.mkdirSync(framesOut, { recursive: true });
  const fps = opts.fps || config.fps;

  try {
    guard();
    onProgress({ stage: "upscaling", pct: 92, engine: "realesrgan", phase: "extract" });
    await execFileAsync(FFMPEG, ["-y", "-i", inPath, "-vsync", "0", path.join(framesIn, "f%06d.png")],
      { windowsHide: true, maxBuffer: 1024 * 1024 * 128 });

    guard();
    onProgress({ stage: "upscaling", pct: 95, engine: "realesrgan", phase: "model" });
    await runRealesrgan(framesIn, framesOut, scale); // batch whole directory in one call

    guard();
    onProgress({ stage: "upscaling", pct: 98, engine: "realesrgan", phase: "encode" });
    const hasAudio = await probeHasAudio(inPath);
    const args = ["-y", "-framerate", String(fps), "-i", path.join(framesOut, "f%06d.png")];
    if (hasAudio) args.push("-i", inPath, "-map", "0:v", "-map", "1:a", "-c:a", "copy");
    args.push("-r", String(fps), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-b:v", "8M", "-shortest", outPath);
    await execFileAsync(FFMPEG, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 128 });

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) throw new Error(`Upscale video vide: ${outPath}`);
    return outPath;
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
}

async function probeHasAudio(file) {
  try { await execFileAsync(FFMPEG, ["-i", file], { windowsHide: true }); }
  catch (e) { return /Stream #\d+:\d+.*: Audio:/.test(e.stderr || ""); }
  return false;
}

export default { upscaleImage, upscaleVideo, realesrganAvailable, upscalerLabel, estimateUpscale, probeSize };
