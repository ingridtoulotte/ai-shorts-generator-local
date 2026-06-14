// Smoke test: full local pipeline, no HTTP server, no API keys.
import fs from "fs";
import path from "path";
import { generateScript } from "../groq.js";
import { generateTTS } from "../tts.js";
import { createVideo } from "../video.js";

function assert(cond, msg) { if (!cond) { console.error("FAIL:", msg); process.exit(1); } console.log("PASS:", msg); }

const t0 = Date.now();
const idea = "La motivation a ne jamais abandonner";

console.log("== 1. Script ==");
const script = await generateScript(idea, { durationSec: 20 });
assert(typeof script === "string" && script.length > 10, "script generated (" + script.length + " chars)");

console.log("== 2. TTS ==");
const audio = await generateTTS(script, path.join(process.cwd(), "audio", "smoke"), { voice: "fr" });
assert(fs.existsSync(audio) && fs.statSync(audio).size > 1000, "audio file produced: " + audio + " (" + fs.statSync(audio).size + " bytes)");

console.log("== 3. Video ==");
const video = await createVideo({ audioPath: audio, text: script, outputName: "smoke.mp4" });
assert(fs.existsSync(video) && fs.statSync(video).size > 10000, "video file produced: " + video + " (" + fs.statSync(video).size + " bytes)");

console.log(`\nALLPASS in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log("script:\n" + script);
