// ===============================================
// render.js - ffmpeg assembly: per-scene caption burn-in,
// scale/crop to portrait, mux audio, concat scenes.
// ===============================================

import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";
import { config } from "./config.js";

const execFileAsync = util.promisify(execFile);
const FFMPEG = ffmpegStatic;

function escFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function pickFont() {
  const candidates = os.platform() === "win32"
    ? ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"]
    : ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

async function run(args) {
  await execFileAsync(FFMPEG, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 128 });
}

// True if the file has at least one audio stream (ffmpeg -i, no ffprobe needed).
async function hasAudioStream(file) {
  try { await execFileAsync(FFMPEG, ["-i", file], { windowsHide: true }); }
  catch (e) { return /Stream #\d+:\d+.*: Audio:/.test(e.stderr || ""); }
  return false;
}

/**
 * renderScene - scale/crop a generated clip to portrait, mux its audio,
 * and burn its caption cues.
 * - External TTS: pass audioPath to mux it (and optional caption cues).
 * - LTX native audio: pass keepSourceAudio:true to keep the clip's own audio.
 * @param {{videoPath:string, audioPath?:string, cues?:Array<{text,start,end}>, keepSourceAudio?:boolean, outPath:string, tmpDir:string}} opts
 * @returns {Promise<string>} outPath
 */
export async function renderScene({ videoPath, audioPath, cues = [], keepSourceAudio = false, outPath, tmpDir }) {
  if (!fs.existsSync(videoPath)) throw new Error(`Video introuvable: ${videoPath}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const font = pickFont();
  const { outWidth: W, outHeight: H } = config;

  let videoFilter = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`;

  if (font && cues.length) {
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const txtFile = path.join(tmpDir, `cue_${i}.txt`);
      fs.writeFileSync(txtFile, cue.text, "utf8");
      videoFilter +=
        `,drawtext=fontfile='${escFilterPath(font)}':textfile='${escFilterPath(txtFile)}'` +
        `:fontcolor=white:fontsize=58:line_spacing=10:expansion=none` +
        `:box=1:boxcolor=black@0.55:boxborderw=28` +
        `:x=(w-text_w)/2:y=h-(h*0.22)` +
        `:enable='between(t,${cue.start},${cue.end})'`;
    }
  }

  const hasExtAudio = audioPath && fs.existsSync(audioPath);
  const srcAudio = !hasExtAudio && keepSourceAudio && (await hasAudioStream(videoPath));
  // Guarantee every clip has an audio stream so concat never fails.
  const useSilent = !hasExtAudio && !srcAudio;

  const args = ["-y", "-i", videoPath];
  if (hasExtAudio) args.push("-i", audioPath);
  if (useSilent) args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000");

  args.push("-filter_complex", `[0:v]${videoFilter}[v]`);
  args.push("-map", "[v]");
  if (hasExtAudio) args.push("-map", "1:a");        // external TTS track
  else if (srcAudio) args.push("-map", "0:a");      // LTX native / source audio
  else args.push("-map", "1:a");                    // silent fallback (anullsrc)

  args.push(
    "-r", String(config.fps),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-b:v", "5M",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    outPath
  );

  await run(args);
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) throw new Error(`Sortie scene vide: ${outPath}`);
  return outPath;
}

/**
 * concatScenes - concatenate processed scene clips (same codec/res/fps) into final mp4.
 * @param {string[]} clipPaths
 * @param {string} outPath
 * @returns {Promise<string>} outPath
 */
export async function concatScenes(clipPaths, outPath) {
  if (!clipPaths.length) throw new Error("Aucun clip a assembler");
  if (clipPaths.length === 1) {
    fs.copyFileSync(clipPaths[0], outPath);
    return outPath;
  }

  const args = ["-y"];
  for (const p of clipPaths) args.push("-i", p);

  const n = clipPaths.length;
  const videoIns = Array.from({ length: n }, (_, i) => `[${i}:v:0][${i}:a:0]`).join("");
  const filter = `${videoIns}concat=n=${n}:v=1:a=1[v][a]`;

  args.push(
    "-filter_complex", filter,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-b:v", "5M",
    "-c:a", "aac", "-b:a", "192k",
    outPath
  );

  await run(args);
  if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) throw new Error(`Sortie finale vide: ${outPath}`);
  return outPath;
}

// ffmpeg's atempo filter only accepts a tempo factor in [0.5, 2.0].
// Express any factor as a chain of in-range factors.
function atempoChain(factor) {
  const parts = [];
  let f = factor;
  while (f > 2.0) { parts.push("atempo=2.0"); f /= 2.0; }
  while (f < 0.5) { parts.push("atempo=0.5"); f /= 0.5; }
  parts.push(`atempo=${f.toFixed(6)}`);
  return parts.join(",");
}

/**
 * fitToDuration - time-stretch a finished clip (audio + video together) so its
 * playback length matches targetSec exactly. No frames or words are cut.
 * No-op when already within config.durationToleranceSec of the target.
 * @param {string} filePath - mp4 to adjust in place
 * @param {number} currentSec - known current duration (e.g. summed audio length)
 * @param {number} targetSec - desired duration
 * @returns {Promise<string>} filePath
 */
export async function fitToDuration(filePath, currentSec, targetSec) {
  if (!targetSec || !currentSec || !fs.existsSync(filePath)) return filePath;
  const tol = config.durationToleranceSec ?? 0.75;
  if (Math.abs(currentSec - targetSec) <= tol) return filePath;

  const speed = currentSec / targetSec;          // >1 speeds up, <1 slows down
  const pts = (targetSec / currentSec).toFixed(6); // video PTS multiplier
  const tmpOut = filePath.replace(/\.mp4$/i, "") + ".fit.mp4";

  const args = [
    "-y", "-i", filePath,
    "-filter_complex", `[0:v]setpts=${pts}*PTS[v];[0:a]${atempoChain(speed)}[a]`,
    "-map", "[v]", "-map", "[a]",
    "-r", String(config.fps),
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-b:v", "5M",
    "-c:a", "aac", "-b:a", "192k",
    tmpOut,
  ];

  await run(args);
  if (!fs.existsSync(tmpOut) || fs.statSync(tmpOut).size === 0) throw new Error(`Sortie fit vide: ${tmpOut}`);
  fs.renameSync(tmpOut, filePath);
  return filePath;
}

export default { renderScene, concatScenes, fitToDuration };
