// ===============================================
// wanBackend.js - real local video generation
// FLUX2 (text -> image) + Wan2.2 I2V camera (image -> motion video)
// Both models already installed in the local ComfyUI instance.
// ===============================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../config.js";
import { runWorkflow, uploadImage } from "../comfyClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLUX2_TEMPLATE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "workflows", "flux2_t2i.json"), "utf8"));
const WAN22_TEMPLATE = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "workflows", "wan22_i2v_camera.json"), "utf8"));

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Frames must satisfy length = 1 + 4k (WanCameraEmbedding constraint).
function durationToFrames(durationSec, fps) {
  const raw = Math.max(1, Math.round(durationSec * fps));
  const k = Math.max(4, Math.round((raw - 1) / 4)); // at least 17 frames (~1s @16fps)
  return 1 + 4 * k;
}

function randomSeed() {
  return Math.floor(Math.random() * 1e15);
}

/**
 * buildFlux2Workflow - clone the FLUX2 text-to-image template with scene params.
 */
function buildFlux2Workflow({ prompt, width, height, seed, filenamePrefix }) {
  const wf = clone(FLUX2_TEMPLATE);
  wf["98:6"].inputs.text = prompt;
  wf["98:47"].inputs.width = width;
  wf["98:47"].inputs.height = height;
  wf["98:48"].inputs.width = width;
  wf["98:48"].inputs.height = height;
  wf["98:25"].inputs.noise_seed = seed;
  wf["9"].inputs.filename_prefix = filenamePrefix;
  // Turbo LoRA for speed (8 steps instead of 21).
  wf["98:104"].inputs.value = true;
  wf["98:99"].inputs.value = 8;
  return wf;
}

/**
 * buildWan22Workflow - clone the Wan2.2 camera I2V template with scene params.
 */
function buildWan22Workflow({ imageFilename, positivePrompt, negativePrompt, width, height, length, cameraPose, fps, seed, filenamePrefix }) {
  const wf = clone(WAN22_TEMPLATE);
  wf["79"].inputs.image = imageFilename;
  wf["81"].inputs.text = positivePrompt;
  wf["74"].inputs.text = negativePrompt;
  wf["87"].inputs.width = width;
  wf["87"].inputs.height = height;
  wf["87"].inputs.length = length;
  wf["87"].inputs.camera_pose = cameraPose;
  wf["83"].inputs.fps = fps;
  wf["71"].inputs.noise_seed = seed;
  wf["73"].inputs.filename_prefix = filenamePrefix;
  return wf;
}

/**
 * generateSceneVideo - produce a real generated video clip for one scene.
 * Pipeline: FLUX2 text->image (establishing shot) -> Wan2.2 I2V camera (motion).
 * @param {object} adapted - output of promptAdapter.adaptScenePrompt
 * @param {{durationSec?:number, jobId?:string}} opts
 * @returns {Promise<{videoPath:string, imagePath:string}>}
 */
export async function generateSceneVideo(adapted, opts = {}) {
  const sceneId = adapted.scene_id;
  const jobId = opts.jobId || "job";
  const durationSec = Number(opts.durationSec) || 4;
  const seed = randomSeed();
  const isCancelled = opts.isCancelled;

  // 1) Starting image: a continuation frame if supplied, else a fresh FLUX2 shot.
  let uploadedName;
  let imageOut;
  if (opts.startImage && fs.existsSync(opts.startImage)) {
    console.log(`[${jobId}] scene ${sceneId}: continuation from supplied frame`);
    uploadedName = await uploadImage(opts.startImage);
    imageOut = { path: opts.startImage };
  } else {
    const imgPrefix = `ai-shorts/${jobId}/scene${sceneId}_img`;
    const imgWorkflow = buildFlux2Workflow({
      prompt: adapted.prompt, width: config.genWidth, height: config.genHeight, seed, filenamePrefix: imgPrefix,
    });
    console.log(`[${jobId}] scene ${sceneId}: generation image (FLUX2)...`);
    const imgFiles = await runWorkflow(imgWorkflow, { timeoutMs: config.comfyTimeoutMs, isCancelled });
    imageOut = imgFiles[0];
    if (!fs.existsSync(imageOut.path)) throw new Error(`Image generee introuvable: ${imageOut.path}`);
    uploadedName = await uploadImage(imageOut.path);
  }

  // 3) Motion video via Wan2.2 I2V camera.
  const frames = durationToFrames(durationSec, config.fps);
  const vidPrefix = `ai-shorts/${jobId}/scene${sceneId}_vid`;
  const vidWorkflow = buildWan22Workflow({
    imageFilename: uploadedName,
    positivePrompt: `${adapted.prompt}. Motion: ${adapted.motion}. Lighting: ${adapted.lighting}.`,
    negativePrompt: adapted.negative_prompt,
    width: config.genWidth,
    height: config.genHeight,
    length: frames,
    cameraPose: adapted.camera,
    fps: config.fps,
    seed: randomSeed(),
    filenamePrefix: vidPrefix,
  });
  console.log(`[${jobId}] scene ${sceneId}: generation video (Wan2.2, ${frames} frames, camera=${adapted.camera})...`);
  const vidFiles = await runWorkflow(vidWorkflow, { timeoutMs: config.comfyTimeoutMs, isCancelled });
  const videoOut = vidFiles.find((f) => f.filename.endsWith(".mp4")) || vidFiles[0];
  if (!fs.existsSync(videoOut.path)) throw new Error(`Video generee introuvable: ${videoOut.path}`);

  return { videoPath: videoOut.path, imagePath: imageOut.path };
}

export default { generateSceneVideo };
