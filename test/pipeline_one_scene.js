// One-scene end-to-end validation: prompt adapter -> TTS -> Wan2.2 backend
// -> captions -> render (scale+caption+audio mux) -> concat (single clip).
import fs from "fs";
import path from "path";

import { adaptScenePrompt } from "../pipeline/promptAdapter.js";
import { generateTTS } from "../tts.js";
import { wavDurationSec } from "../pipeline/audioUtils.js";
import { buildSceneCues } from "../pipeline/captions.js";
import { getBackend } from "../pipeline/backends/index.js";
import { renderScene, concatScenes } from "../pipeline/render.js";
import { config } from "../pipeline/config.js";

const jobId = "onescene";
const dirs = {
  audio: path.join(config.audioDir, jobId),
  tmp: path.join(config.tmpDir, jobId),
  output: config.outputDir,
};
for (const d of Object.values(dirs)) fs.mkdirSync(d, { recursive: true });

const scene = {
  scene_id: 1,
  narration: "Le cafe noir fume doucement dans la lumiere chaude du matin, pose sur une table en bois.",
  visual_idea: "Une tasse de cafe noir fumant sur une table en bois, lumiere doree du matin, ambiance cosy",
  duration_sec: 5,
};

console.log("1) Adaptation du prompt...");
const adapted = await adaptScenePrompt(scene, {
  idea: "une courte video relaxante sur le cafe du matin",
  durationSec: 15,
  style: "cinematic",
});
console.log("ADAPTED:", JSON.stringify(adapted, null, 2));

console.log("2) Synthese audio (TTS)...");
const audioPath = await generateTTS(scene.narration, path.join(dirs.audio, "scene1"), { voice: "fr" });
const audioDuration = wavDurationSec(audioPath);
console.log(`AUDIO: ${audioPath} (${audioDuration.toFixed(2)}s)`);

console.log("3) Generation video (backend)...");
const backend = getBackend();
const { videoPath } = await backend.generateSceneVideo(adapted, { durationSec: audioDuration, jobId });
console.log(`VIDEO BRUT: ${videoPath}`);

console.log("4) Captions...");
const cues = buildSceneCues(scene.narration, audioDuration);
console.log("CUES:", JSON.stringify(cues));

console.log("5) Render scene (scale/crop + audio + captions)...");
const scenePath = path.join(dirs.tmp, "scene1.mp4");
await renderScene({ videoPath, audioPath, cues, outPath: scenePath, tmpDir: dirs.tmp });
console.log(`SCENE RENDERED: ${scenePath} (${fs.statSync(scenePath).size} bytes)`);

console.log("6) Concat final...");
const finalPath = path.join(dirs.output, `${jobId}.mp4`);
await concatScenes([scenePath], finalPath);
console.log(`FINAL: ${finalPath} (${fs.statSync(finalPath).size} bytes)`);

console.log("DONE");
