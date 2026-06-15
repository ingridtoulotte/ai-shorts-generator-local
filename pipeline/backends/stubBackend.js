// ===============================================
// stubBackend.js - GPU-free test backend (GEN_ENGINE=stub).
// Emits a solid-color clip (with a silent audio track) of the requested
// duration so the whole pipeline can be exercised without ComfyUI / LTX.
// The silent track lets the native-audio (keepSourceAudio) path be tested too.
// For testing only.
// ===============================================

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";
import { config } from "../config.js";

const execFileAsync = util.promisify(execFile);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function generateSceneVideo(adapted, opts = {}) {
  const dur = Math.max(1, Number(opts.durationSec) || 4);
  // Optional simulated GPU time so cancellation can be tested without a GPU.
  const delay = Number(process.env.STUB_DELAY_MS) || 0;
  for (let waited = 0; waited < delay; waited += 200) {
    if (opts.isCancelled && opts.isCancelled()) { const e = new Error("cancelled"); e.cancelled = true; throw e; }
    await sleep(200);
  }
  const dir = path.join(config.tmpDir, "stub");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `stub_${opts.jobId || "job"}_${adapted.scene_id}_${Date.now()}.mp4`);

  const palette = ["0x223355", "0x2e5d34", "0x5d2e2e", "0x4a3a1b", "0x2e4a5d", "0x472e5d"];
  const color = palette[Number(adapted.scene_id) % palette.length];
  const args = [
    "-y",
    "-f", "lavfi", "-i", `color=c=${color}:s=${config.genWidth}x${config.genHeight}:r=${config.fps}:d=${dur.toFixed(2)}`,
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t", dur.toFixed(2),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
    "-c:a", "aac", "-shortest",
    out,
  ];
  await execFileAsync(ffmpegStatic, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 32 });
  return { videoPath: out, imagePath: null };
}

export default { generateSceneVideo };
