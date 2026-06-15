// ===============================================
// stubBackend.js - GPU-free test backend (GEN_ENGINE=stub).
// Emits a solid-color clip of the requested duration so the rest of the
// pipeline (script -> scenes -> TTS -> captions -> render -> fit -> concat)
// can be exercised end-to-end without ComfyUI. For testing only.
// ===============================================

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";
import { config } from "../config.js";

const execFileAsync = util.promisify(execFile);

export async function generateSceneVideo(adapted, opts = {}) {
  const dur = Math.max(1, Number(opts.durationSec) || 4);
  const dir = path.join(config.tmpDir, "stub");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `stub_${opts.jobId || "job"}_${adapted.scene_id}_${Date.now()}.mp4`);

  // Per-scene color so concatenated scenes are visually distinct.
  // Hex (no commas) -> safe inside the lavfi color= option.
  const palette = ["0x223355", "0x2e5d34", "0x5d2e2e", "0x4a3a1b", "0x2e4a5d", "0x472e5d"];
  const color = palette[Number(adapted.scene_id) % palette.length];
  // Video + a silent stereo track so the AV/native-audio path (LTX) can be tested too.
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
