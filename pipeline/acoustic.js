// ===============================================
// acoustic.js - acoustic continuity for continuation videos.
// Measures the seed clip's loudness profile (EBU R128: integrated loudness,
// true peak, loudness range, gate threshold) and retargets each continuation
// segment to the same profile via two-pass linear loudnorm, so the extension
// "sounds like it belongs to the same video" (no jarring volume / tone jumps).
// ===============================================

import fs from "fs";
import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = util.promisify(execFile);
const FFMPEG = ffmpegStatic;

// Extract the loudnorm JSON block printed to stderr.
function parseLoudnormJson(stderr) {
  const m = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(stderr || "");
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

function finite(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** True if the file carries at least one (non-silent) audio stream. */
export async function hasAudio(file) {
  try { await execFileAsync(FFMPEG, ["-i", file], { windowsHide: true }); }
  catch (e) { return /Stream #\d+:\d+.*: Audio:/.test(e.stderr || ""); }
  return false;
}

/**
 * analyzeLoudness - measure a clip's EBU R128 loudness profile.
 * @returns {Promise<null|{i:number,tp:number,lra:number,thresh:number}>}
 */
export async function analyzeLoudness(file) {
  if (!fs.existsSync(file) || !(await hasAudio(file))) return null;
  // loudnorm prints its JSON to stderr and exits 0, so capture stderr on success too.
  const { stderr = "" } = await execFileAsync(FFMPEG,
    ["-hide_banner", "-i", file, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 64 }).catch((e) => ({ stderr: e.stderr || "" }));
  const j = parseLoudnormJson(stderr);
  if (!j) return null;
  const i = finite(j.input_i, null);
  if (i === null || i <= -70) return null; // silent / unmeasurable
  return {
    i,
    tp: finite(j.input_tp, -1.5),
    lra: Math.max(1, finite(j.input_lra, 7)),
    thresh: finite(j.input_thresh, i - 10),
  };
}

/**
 * applyAcousticMatch - retarget `inFile`'s loudness to `target` (a profile from
 * analyzeLoudness) using two-pass linear loudnorm. Writes `outFile`.
 * No-op copy when target/audio missing so the pipeline never breaks.
 * @returns {Promise<{outFile:string, matched:boolean, target?:object}>}
 */
export async function applyAcousticMatch(inFile, outFile, target) {
  if (!target || !(await hasAudio(inFile))) {
    fs.copyFileSync(inFile, outFile);
    return { outFile, matched: false };
  }
  const m = await analyzeLoudness(inFile);
  if (!m) { fs.copyFileSync(inFile, outFile); return { outFile, matched: false }; }

  const I = target.i.toFixed(2);
  const TP = Math.min(-0.1, target.tp).toFixed(2);
  const LRA = Math.min(20, Math.max(1, target.lra)).toFixed(2);
  const filter =
    `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:` +
    `measured_I=${m.i.toFixed(2)}:measured_TP=${m.tp.toFixed(2)}:` +
    `measured_LRA=${m.lra.toFixed(2)}:measured_thresh=${m.thresh.toFixed(2)}:` +
    `linear=true:print_format=summary`;

  await execFileAsync(FFMPEG,
    ["-y", "-i", inFile, "-map", "0:v?", "-map", "0:a", "-af", filter,
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", outFile],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 128 });

  if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
    fs.copyFileSync(inFile, outFile);
    return { outFile, matched: false };
  }
  return { outFile, matched: true, target };
}

export default { analyzeLoudness, applyAcousticMatch, hasAudio };
