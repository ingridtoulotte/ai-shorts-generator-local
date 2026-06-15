// ===============================================
// continuation.js - infinite-extension engine.
// Take the last frame of a clip -> 2x upscale -> use as the start image for the
// next image-to-video segment -> repeat -> stitch into one long video.
// Visual continuity comes from the carried frame + continuity tags; the audio
// stays ambient (no narration restart) so segments feel like one shot.
// ===============================================

import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";

import { config } from "./config.js";
import { adaptScenePrompt } from "./promptAdapter.js";
import { getBackend } from "./backends/index.js";
import { renderScene, concatScenes, fitToDuration } from "./render.js";
import { CancelledError } from "./comfyClient.js";

const execFileAsync = util.promisify(execFile);
const FFMPEG = ffmpegStatic;

function nativeAudioOn() {
  return Boolean(config.ltx?.nativeAudio) && (config.engine === "ltx" || process.env.FORCE_NATIVE_AUDIO === "1");
}

// Grab the last frame of a video as a PNG (seeks ~1s before end, writes last frame).
export async function extractLastFrame(videoPath, outPng) {
  await execFileAsync(FFMPEG, ["-y", "-sseof", "-1", "-i", videoPath, "-update", "1", "-frames:v", "1", outPng],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 64 });
  if (!fs.existsSync(outPng)) throw new Error(`Extraction derniere frame echouee: ${videoPath}`);
  return outPng;
}

// 2x spatial upscale (lanczos) of an image.
export async function upscale2x(inPng, outPng) {
  await execFileAsync(FFMPEG, ["-y", "-i", inPng, "-vf", "scale=iw*2:ih*2:flags=lanczos", outPng],
    { windowsHide: true, maxBuffer: 1024 * 1024 * 64 });
  if (!fs.existsSync(outPng)) throw new Error(`Upscale 2x echoue: ${inPng}`);
  return outPng;
}

// Optional: motion-interpolate to smooth segment seams (slow; off by default).
async function interpolate(inPath, outPath, fps) {
  await execFileAsync(FFMPEG, ["-y", "-i", inPath, "-vf", `minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1`,
    "-c:a", "copy", outPath], { windowsHide: true, maxBuffer: 1024 * 1024 * 128 });
  return outPath;
}

/**
 * continueVideo - extend a seed video by N image-to-video segments.
 * @param {{seedVideoPath?:string, seedImagePath?:string, idea:string, jobId:string,
 *          segments?:number, segDurationSec?:number, prependSeed?:boolean,
 *          smooth?:boolean, isCancelled?:()=>boolean, onProgress?:(p:object)=>void}} opts
 * @returns {Promise<{videoPath:string, segments:number}>}
 */
export async function continueVideo(opts = {}) {
  const jobId = opts.jobId || `cont_${Date.now()}`;
  const segments = Math.max(1, Number(opts.segments) || 1);
  const segDurationSec = Math.max(1, Math.round(Number(opts.segDurationSec) || 5));
  const idea = opts.idea || "seamless continuation of the previous shot";
  const isCancelled = opts.isCancelled || (() => false);
  const onProgress = opts.onProgress || (() => {});
  const guard = () => { if (isCancelled()) throw new CancelledError(`continuation ${jobId} annule`); };

  const tmp = path.join(config.tmpDir, jobId);
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(config.outputDir, { recursive: true });

  // Seed frame: explicit image, or the last frame of the seed video.
  let frame = opts.seedImagePath;
  if (!frame) {
    if (!opts.seedVideoPath || !fs.existsSync(opts.seedVideoPath)) throw new Error("continueVideo: ni seedImagePath ni seedVideoPath valide");
    frame = await extractLastFrame(opts.seedVideoPath, path.join(tmp, "seed_last.png"));
  }
  frame = await upscale2x(frame, path.join(tmp, "seed_last_2x.png"));

  const backend = getBackend();
  const native = nativeAudioOn();
  const clips = [];
  const continuityTags = [];
  let totalDur = 0;

  for (let s = 0; s < segments; s++) {
    guard();
    onProgress({ stage: "segment", segment: s + 1, total: segments, pct: Math.round((s / segments) * 90) });

    const scene = { scene_id: s + 1, narration: "", visual_idea: idea, duration_sec: segDurationSec };
    const adapted = await adaptScenePrompt(scene, { idea, durationSec: segDurationSec, continuityTags });
    for (const t of adapted.continuity_tags || []) if (!continuityTags.includes(t)) continuityTags.push(t);

    guard();
    const { videoPath } = await backend.generateSceneVideo(adapted, {
      durationSec: segDurationSec,
      narration: "", // continuation: no narration restart
      ambience: `realistic continuous environmental sound matching ${idea}`,
      startImage: frame,
      jobId,
      isCancelled,
    });

    const outScene = path.join(tmp, `seg_${String(s + 1).padStart(2, "0")}.mp4`);
    await renderScene({ videoPath, audioPath: null, cues: [], keepSourceAudio: native, outPath: outScene, tmpDir: tmp });
    clips.push(outScene);
    totalDur += segDurationSec;

    // Carry the new last frame forward.
    frame = await upscale2x(await extractLastFrame(outScene, path.join(tmp, `last_${s + 1}.png`)), path.join(tmp, `last_${s + 1}_2x.png`));
  }

  guard();
  onProgress({ stage: "stitch", pct: 94 });
  const all = (opts.prependSeed !== false && opts.seedVideoPath && fs.existsSync(opts.seedVideoPath))
    ? [opts.seedVideoPath, ...clips] : clips;
  const finalPath = path.join(config.outputDir, `${jobId}.mp4`);
  await concatScenes(all, finalPath);

  if (opts.smooth) {
    onProgress({ stage: "smooth", pct: 97 });
    const sm = finalPath.replace(/\.mp4$/i, "") + ".smooth.mp4";
    await interpolate(finalPath, sm, config.fps);
    fs.renameSync(sm, finalPath);
  }

  onProgress({ stage: "done", pct: 100 });
  return { videoPath: finalPath, segments: clips.length };
}

export default { continueVideo, extractLastFrame, upscale2x };
