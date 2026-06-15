// Full multi-scene end-to-end run via the orchestrator (Wan2.2 engine).
import { runPipeline } from "../pipeline/orchestrator.js";

const idea = "3 astuces simples pour mieux dormir chaque nuit";

const result = await runPipeline(idea, {
  durationSec: 20,
  voice: "fr",
  style: "cinematic",
  jobId: "multiscene",
});

console.log("SCENES:", result.scenes.length);
console.log("VIDEO:", result.videoPath);
console.log("DONE");
