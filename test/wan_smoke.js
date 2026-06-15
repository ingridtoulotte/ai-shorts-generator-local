import { generateSceneVideo } from "../pipeline/backends/wanBackend.js";

const adapted = {
  scene_id: 1,
  prompt: "A cup of coffee steaming on a wooden desk by a sunny window, cinematic, photorealistic, high detail, vertical short video",
  negative_prompt: "blurry, low quality, distorted, watermark, text, static frame",
  camera: "Zoom In",
  motion: "steam rising gently, soft light moving",
  lighting: "warm morning sunlight through window",
  style: "cinematic",
};

const t0 = Date.now();
const res = await generateSceneVideo(adapted, { durationSec: 3, jobId: "smoketest" });
console.log("RESULT:", res);
console.log(`done in ${((Date.now()-t0)/1000).toFixed(1)}s`);
