// ===============================================
// orchestrator.js - full local pipeline
// idea -> script -> scenes -> prompt adaptation -> generation -> audio
//      -> captions -> per-scene render -> final concat
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

function ensureDirs(jobId) {
  const dirs = {
    audio: path.join(config.audioDir, jobId),
    tmp: path.join(config.tmpDir, jobId),
    output: config.outputDir,
  };
  for (const d of [dirs.audio, dirs.tmp, dirs.output]) fs.mkdirSync(d, { recursive: true });
  return dirs;
}

/**
 * runPipeline - generate a full local AI short from an idea.
 * @param {string} idea
 * @param {{durationSec?:number, voice?:string, style?:string, jobId?:string}} opts
 * @returns {Promise<{videoPath:string, script:object, scenes:Array, adaptedScenes:Array}>}
 */
export async function runPipeline(idea, opts = {}) {
  if (!idea || !String(idea).trim()) throw new Error("Idee vide");

  const jobId = opts.jobId || `job_${Date.now()}`;
  const durationSec = Number(opts.durationSec) || 30;
  const voice = opts.voice || "fr";
  const style = opts.style;
  const dirs = ensureDirs(jobId);
  const backend = getBackend();

  console.log(`[${jobId}] 1/6 Generation du script...`);
  // voice drives the script language (fr/en/es) so narration + subtitles match it.
  const script = await generateScript(idea, { durationSec, voice });

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

  for (const scene of scenes) {
    const sceneId = scene.scene_id;
    console.log(`[${jobId}] 3/6 Scene ${sceneId}/${scenes.length}: adaptation du prompt...`);
    const adapted = await adaptScenePrompt(scene, {
      idea,
      script: script.script,
      durationSec,
      style,
      continuityTags,
    });
    for (const t of adapted.continuity_tags || []) {
      if (!continuityTags.includes(t)) continuityTags.push(t);
    }

    console.log(`[${jobId}] 4/6 Scene ${sceneId}/${scenes.length}: synthese audio...`);
    const audioPath = await generateTTS(scene.narration, path.join(dirs.audio, `scene${sceneId}`), { voice });
    const audioDuration = audioPath.endsWith(".wav") ? wavDurationSec(audioPath) : Number(scene.duration_sec) || 4;
    totalAudioSec += audioDuration;

    console.log(`[${jobId}] 5/6 Scene ${sceneId}/${scenes.length}: generation video (${config.engine})...`);
    const { videoPath } = await backend.generateSceneVideo(adapted, {
      durationSec: audioDuration,
      jobId,
    });

    const cues = buildSceneCues(scene.narration, audioDuration);
    const scenePath = path.join(dirs.tmp, `scene${sceneId}.mp4`);
    await renderScene({
      videoPath,
      audioPath,
      cues,
      outPath: scenePath,
      tmpDir: dirs.tmp,
    });
    clips.push(scenePath);
  }

  console.log(`[${jobId}] 6/6 Assemblage final...`);
  const finalPath = path.join(dirs.output, `${jobId}.mp4`);
  await concatScenes(clips, finalPath);

  // Make the delivered video match the requested duration exactly.
  await fitToDuration(finalPath, totalAudioSec, durationSec);

  console.log(`[${jobId}] Termine -> ${finalPath}`);
  return { videoPath: finalPath, script, scenes, adaptedScenes: continuityTags };
}

export default { runPipeline };
