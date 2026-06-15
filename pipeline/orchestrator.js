// ===============================================
// orchestrator.js - full local pipeline (Wan 2.2)
// idea -> script -> scenes -> prompt adaptation -> FLUX2+Wan2.2 generation
//      -> SAPI TTS -> captions -> per-scene render -> concat -> exact-duration fit
//
// Supports cooperative cancellation (opts.isCancelled), progress reporting
// (opts.onProgress) and a continuation start image (opts.startImage).
// (The native-audio branch is inert here; engine=wan always uses TTS.)
// ===============================================

import fs from "fs";
import path from "path";

import { config } from "./config.js";
import { generateScript } from "./scriptgen.js";
import { planScenes } from "./sceneplanner.js";
import { adaptScenePrompt } from "./promptAdapter.js";
import { getBackend } from "./backends/index.js";
import { generateTTS } from "../tts.js";
import { wavDurationSec } from "./audioUtils.js";
import { buildSceneCues } from "./captions.js";
import { renderScene, concatScenes, fitToDuration } from "./render.js";
import { CancelledError } from "./comfyClient.js";

function ensureDirs(jobId) {
  const dirs = {
    audio: path.join(config.audioDir, jobId),
    tmp: path.join(config.tmpDir, jobId),
    output: config.outputDir,
  };
  for (const d of [dirs.audio, dirs.tmp, dirs.output]) fs.mkdirSync(d, { recursive: true });
  return dirs;
}

// Audio mode -> whether THIS scene carries spoken narration.
//   A = narrated intro (scene 1 only)   B = SFX/ambience only (never speak)
//   C = narration + ambience (always)   D = auto (treated as C)
function shouldSpeak(mode, sceneIdx) {
  const m = String(mode || "C").toUpperCase();
  if (m === "B") return false;
  if (m === "A") return sceneIdx === 0;
  return true; // C, D
}

function deriveAmbience(adapted, scene) {
  const subject = adapted?.input_summary || scene?.visual_idea || scene?.narration || "";
  const motion = adapted?.motion ? `, ${adapted.motion}` : "";
  return `realistic environmental sounds for ${subject}${motion}`.trim();
}

/**
 * runPipeline - generate a full local AI short from an idea.
 * @param {string} idea
 * @param {{durationSec?:number, voice?:string, style?:string, jobId?:string,
 *          audioMode?:string, startImage?:string,
 *          isCancelled?:()=>boolean, onProgress?:(p:object)=>void}} opts
 * @returns {Promise<{videoPath:string, script:object, scenes:Array}>}
 */
export async function runPipeline(idea, opts = {}) {
  if (!idea || !String(idea).trim()) throw new Error("Idee vide");

  const jobId = opts.jobId || `job_${Date.now()}`;
  const durationSec = Number(opts.durationSec) || 30;
  const voice = opts.voice || "fr";
  const style = opts.style;
  const audioMode = opts.audioMode || "C";
  const isCancelled = opts.isCancelled || (() => false);
  const onProgress = opts.onProgress || (() => {});
  const dirs = ensureDirs(jobId);
  const backend = getBackend();
  // LTX 2.3 generates its own audio -> no TTS, no subtitles.
  // FORCE_NATIVE_AUDIO=1 lets the stub backend exercise this path in tests.
  const nativeAudio = Boolean(config.ltx?.nativeAudio) &&
    (config.engine === "ltx" || process.env.FORCE_NATIVE_AUDIO === "1");

  const guard = () => { if (isCancelled()) throw new CancelledError(`job ${jobId} annule`); };

  guard();
  onProgress({ stage: "script", pct: 2 });
  console.log(`[${jobId}] 1/6 Generation du script...`);
  const script = await generateScript(idea, { durationSec, voice });

  guard();
  onProgress({ stage: "scenes", pct: 6 });
  console.log(`[${jobId}] 2/6 Decoupage en scenes...`);
  const scenes = await planScenes(script.script, {
    durationSec,
    minScenes: config.minScenes,
    maxScenes: config.maxScenes,
  });
  if (!scenes.length) throw new Error("Aucune scene generee");

  const continuityTags = [];
  const clips = [];
  let totalAudioSec = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneId = scene.scene_id;
    guard();
    onProgress({ stage: "scene", scene: i + 1, total: scenes.length, pct: 10 + Math.round((i / scenes.length) * 80) });

    console.log(`[${jobId}] 3/6 Scene ${sceneId}/${scenes.length}: adaptation du prompt...`);
    const adapted = await adaptScenePrompt(scene, { idea, script: script.script, durationSec, style, continuityTags });
    for (const t of adapted.continuity_tags || []) if (!continuityTags.includes(t)) continuityTags.push(t);

    const speak = nativeAudio ? shouldSpeak(audioMode, i) : true;

    let audioPath = null;
    let sceneDuration;
    if (nativeAudio) {
      // Round to match the integer-second length LTX renders, so the fit is correct.
      sceneDuration = Math.max(1, Math.round(Number(scene.duration_sec) || 4));
    } else {
      console.log(`[${jobId}] 4/6 Scene ${sceneId}/${scenes.length}: synthese audio...`);
      audioPath = await generateTTS(scene.narration, path.join(dirs.audio, `scene${sceneId}`), { voice });
      sceneDuration = audioPath.endsWith(".wav") ? wavDurationSec(audioPath) : Number(scene.duration_sec) || 4;
    }
    totalAudioSec += sceneDuration;

    guard();
    console.log(`[${jobId}] 5/6 Scene ${sceneId}/${scenes.length}: generation video (${config.engine})...`);
    const { videoPath } = await backend.generateSceneVideo(adapted, {
      durationSec: sceneDuration,
      narration: speak ? scene.narration : "",
      ambience: deriveAmbience(adapted, scene),
      startImage: i === 0 && opts.startImage ? opts.startImage : null,
      jobId,
      isCancelled,
    });

    // No subtitles in the LTX variant; captions only when using external TTS.
    const cues = nativeAudio ? [] : buildSceneCues(scene.narration, sceneDuration);
    const scenePath = path.join(dirs.tmp, `scene${sceneId}.mp4`);
    await renderScene({ videoPath, audioPath, cues, keepSourceAudio: nativeAudio, outPath: scenePath, tmpDir: dirs.tmp });
    clips.push(scenePath);
  }

  guard();
  onProgress({ stage: "assemble", pct: 92 });
  console.log(`[${jobId}] 6/6 Assemblage final...`);
  const finalPath = path.join(dirs.output, `${jobId}.mp4`);
  await concatScenes(clips, finalPath);
  await fitToDuration(finalPath, totalAudioSec, durationSec);

  onProgress({ stage: "done", pct: 100 });
  console.log(`[${jobId}] Termine -> ${finalPath}`);
  return { videoPath: finalPath, script, scenes };
}

export default { runPipeline };
