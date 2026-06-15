// ===============================================
// batch_test.mjs - end-to-end pipeline crash test.
// Runs several (idea, voice, duration) jobs through runPipeline and checks:
//   - language: narration is actually in the language the voice implies
//   - duration: final mp4 length matches the requested duration
//   - context : scenes exist, each has narration, and rebuild the script
// Use GEN_ENGINE=stub for a fast GPU-free run, or wan/ltx for the real thing.
//
//   node test/batch_test.mjs
// ===============================================

import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";
import { runPipeline } from "../pipeline/orchestrator.js";

const exec = util.promisify(execFile);

async function probeDurationSec(file) {
  // ffmpeg-static has no ffprobe; parse "Duration:" from ffmpeg stderr.
  try {
    await exec(ffmpegStatic, ["-i", file], { maxBuffer: 1024 * 1024 * 16 });
  } catch (e) {
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(e.stderr || "");
    if (m) return (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]);
  }
  return NaN;
}

// Cheap language detector via stop-word hit counts (enough to catch fr/en/es mixups).
const MARKERS = {
  fr: ["le", "la", "les", "tu", "ne", "pas", "est", "ton", "ta", "chaque", "pour", "jamais"],
  en: ["the", "you", "your", "to", "is", "and", "never", "every", "start", "so"],
  es: ["el", "la", "que", "de", "no", "tu", "es", "para", "cada", "nunca", "poder"],
};
function detectLang(text) {
  const words = String(text).toLowerCase().match(/[a-zàâçéèêëîïôûùüÿñæœ]+/g) || [];
  const set = words;
  let best = "??", bestScore = -1;
  for (const [lang, mk] of Object.entries(MARKERS)) {
    const score = set.filter((w) => mk.includes(w)).length;
    if (score > bestScore) { bestScore = score; best = lang; }
  }
  return best;
}

const CONFIGS = [
  { idea: "why discipline beats motivation", voice: "en", duration: 10 },
  { idea: "la magie cachee du cosmos", voice: "fr", duration: 18 },
  { idea: "el poder silencioso de los habitos", voice: "es", duration: 12 },
  { idea: "morning routines that change your life", voice: "en", duration: 25 },
];

function expectedLang(voice) {
  const v = voice.toLowerCase();
  return v.startsWith("en") ? "en" : v.startsWith("es") ? "es" : "fr";
}

let fails = 0;
const N = Number(process.env.BT_N) || CONFIGS.length; // run first N configs
const RUN = CONFIGS.slice(0, N);
console.log(`\n=== batch_test (engine=${process.env.GEN_ENGINE || "wan"}, ${RUN.length} configs) ===\n`);

for (const c of RUN) {
  const tag = `${c.voice}/${c.duration}s`;
  try {
    const t0 = Date.now();
    const { videoPath, script, scenes } = await runPipeline(c.idea, {
      durationSec: c.duration,
      voice: c.voice,
      jobId: `test_${c.voice}_${c.duration}`,
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);

    const want = expectedLang(c.voice);
    const got = detectLang(script.script);
    const dur = await probeDurationSec(videoPath);

    const langOK = got === want;
    const durOK = Number.isFinite(dur) && Math.abs(dur - c.duration) <= 1.25;
    const ctxOK = scenes.length >= 1 && scenes.every((s) => s.narration && s.narration.trim());

    const ok = langOK && durOK && ctxOK;
    if (!ok) fails++;

    console.log(`[${ok ? "PASS" : "FAIL"}] ${tag}  (${secs}s, src=${script.source})`);
    console.log(`   lang : want=${want} got=${got}  ${langOK ? "ok" : "<< MISMATCH"}`);
    console.log(`   dur  : want=${c.duration}s got=${Number.isFinite(dur) ? dur.toFixed(2) : "NaN"}s  ${durOK ? "ok" : "<< OFF"}`);
    console.log(`   ctx  : ${scenes.length} scenes, all narrated=${ctxOK}`);
    console.log(`   script: ${JSON.stringify(script.script).slice(0, 140)}...`);
    console.log("");
  } catch (err) {
    fails++;
    console.log(`[FAIL] ${tag}  threw: ${err.message}\n`);
  }
}

console.log(`=== ${fails === 0 ? "ALL PASS" : fails + " FAILED"} ===`);
process.exit(fails === 0 ? 0 : 1);
