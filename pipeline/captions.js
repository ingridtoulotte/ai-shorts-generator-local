// ===============================================
// captions.js - per-scene caption cue generation
// Distributes narration words evenly over the scene's audio duration.
// ===============================================

/**
 * buildSceneCues - split narration into timed caption chunks.
 * @param {string} narration
 * @param {number} durationSec - actual duration of this scene's clip
 * @param {{maxWordsPerCue?:number}} [opts]
 * @returns {Array<{text:string, start:number, end:number}>}
 */
export function buildSceneCues(narration, durationSec, opts = {}) {
  const maxWords = opts.maxWordsPerCue || 5;
  const words = String(narration).trim().split(/\s+/).filter(Boolean);
  if (!words.length || !durationSec) return [];

  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }

  const per = durationSec / chunks.length;
  return chunks.map((text, i) => ({
    text,
    start: Math.round(i * per * 100) / 100,
    end: Math.round((i + 1) * per * 100) / 100,
  }));
}

export default { buildSceneCues };
