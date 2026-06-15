// ===============================================
// promptAdapter.js - local prompt adaptation engine
// Converts a scene (narration + visual idea) into a
// generation-ready prompt for LTX/Wan video models.
// Local LLM (Ollama/gemma4) with deterministic fallback.
// ===============================================

import { chatJSON, isAvailable } from "./ollama.js";

const SYSTEM = `You are a local prompt adaptation engine for text-to-video generation.

Task:
Convert raw scene descriptions into optimized prompts for local video generation models (Wan2.2 / LTX).

You must produce strict structured JSON only, matching this schema exactly:
{
  "scene_id": 1,
  "input_summary": "",
  "prompt": "",
  "negative_prompt": "",
  "camera": "",
  "motion": "",
  "lighting": "",
  "style": "",
  "continuity_tags": [],
  "generation_notes": []
}

Rules:
- Stay fully local. No cloud dependency, no URLs.
- Do not return generic prose. Make the prompt concrete, visual, generation-friendly.
- Prioritize: subject clarity, motion, temporal coherence, shot composition, lighting, environment, realism, scene continuity.
- Remove contradictions. Expand weak prompts into model-usable prompts. Condense overlong prompts (target 40-80 words for "prompt").
- Preserve the user's intent.
- "camera" must be ONE of exactly: Static, Pan Up, Pan Down, Pan Left, Pan Right, Zoom In, Zoom Out, ClockWise (CW), Anti Clockwise (ACW).
- "motion" describes subject/environment motion (e.g. "wind moving leaves, water flowing, subtle parallax").
- "style" must be ONE of: cinematic, realistic, documentary, anime, meme, dramatic, educational.
- "continuity_tags" is a short list of stable visual identifiers (subject appearance, palette, setting) to keep consistent across scenes that share the same subject.
- "negative_prompt" lists artifacts/contradictions to avoid (blurry, text, watermark, deformed, static frame, etc.) - keep short.
- "generation_notes" is a short list of plain-text hints (e.g. "maintain same character outfit as scene 1").
- If the input is ambiguous, resolve it into the most plausible visual interpretation without changing the user's intent.

Return only valid JSON, no markdown fences.`;

const VALID_CAMERA = ["Static", "Pan Up", "Pan Down", "Pan Left", "Pan Right", "Zoom In", "Zoom Out", "ClockWise (CW)", "Anti Clockwise (ACW)"];
const VALID_STYLE = ["cinematic", "realistic", "documentary", "anime", "meme", "dramatic", "educational"];

const DEFAULT_NEGATIVE = "blurry, low quality, distorted, deformed, watermark, text overlay, subtitles, static frame, frozen, glitch, extra limbs, bad anatomy";

function pickCameraFallback(visualIdea) {
  const t = String(visualIdea).toLowerCase();
  if (/zoom.?out|pull(s)? back|wide(n)?ing/.test(t)) return "Zoom Out";
  if (/zoom.?in|close.?up|push(es)? in/.test(t)) return "Zoom In";
  if (/pan(s)?\s*(right)|right to left|moving right/.test(t)) return "Pan Right";
  if (/pan(s)?\s*(left)|left to right|moving left/.test(t)) return "Pan Left";
  if (/rise(s)?|upward|crane up|ascend/.test(t)) return "Pan Up";
  if (/descend|downward|crane down/.test(t)) return "Pan Down";
  if (/orbit|rotate|spin|circling/.test(t)) return "ClockWise (CW)";
  return "Static";
}

// Deterministic fallback: build a usable prompt without an LLM.
function fallbackAdapted(scene, context) {
  const style = context.style && VALID_STYLE.includes(context.style) ? context.style : "cinematic";
  const camera = pickCameraFallback(scene.visual_idea || scene.narration);
  const subject = scene.visual_idea || scene.narration || context.idea;
  const prompt = `${subject}, ${style} style, natural motion, coherent lighting, high detail, photorealistic, vertical short video, smooth ${camera.toLowerCase()} camera movement`;
  return {
    scene_id: scene.scene_id,
    input_summary: scene.narration || scene.visual_idea || "",
    prompt,
    negative_prompt: DEFAULT_NEGATIVE,
    camera,
    motion: "subtle natural motion, gentle parallax",
    lighting: "soft natural light, coherent direction",
    style,
    continuity_tags: context.continuityTags || [],
    generation_notes: ["fallback (no LLM available)"],
    source: "local-fallback",
  };
}

function normalize(out, scene, context) {
  const camera = VALID_CAMERA.includes(out.camera) ? out.camera : pickCameraFallback(scene.visual_idea || scene.narration);
  const style = VALID_STYLE.includes(out.style) ? out.style : (context.style || "cinematic");
  const prompt = String(out.prompt || "").trim() || `${scene.visual_idea || scene.narration}, ${style} style`;
  return {
    scene_id: scene.scene_id,
    input_summary: String(out.input_summary || scene.narration || "").trim(),
    prompt,
    negative_prompt: String(out.negative_prompt || DEFAULT_NEGATIVE).trim() || DEFAULT_NEGATIVE,
    camera,
    motion: String(out.motion || "").trim() || "subtle natural motion",
    lighting: String(out.lighting || "").trim() || "soft natural light",
    style,
    continuity_tags: Array.isArray(out.continuity_tags) ? out.continuity_tags.map(String) : [],
    generation_notes: Array.isArray(out.generation_notes) ? out.generation_notes.map(String) : [],
    source: "gemma4",
  };
}

/**
 * adaptScenePrompt - rewrite a scene into a generation-ready prompt.
 * @param {{scene_id:number, narration:string, visual_idea:string}} scene
 * @param {{idea?:string, platform?:string, durationSec?:number, script?:string, style?:string, continuityTags?:string[]}} context
 * @returns {Promise<object>} adapted prompt object (see SYSTEM schema)
 */
export async function adaptScenePrompt(scene, context = {}) {
  if (!scene || !(scene.visual_idea || scene.narration)) throw new Error("Scene vide");

  if (await isAvailable()) {
    try {
      const user = JSON.stringify({
        scene_id: scene.scene_id,
        narration: scene.narration,
        visual_idea: scene.visual_idea,
        duration_sec: scene.duration_sec,
        original_idea: context.idea,
        platform: context.platform || "vertical short (9:16)",
        target_duration_sec: context.durationSec,
        full_script: context.script,
        requested_style: context.style || "cinematic",
        continuity_tags_so_far: context.continuityTags || [],
      });
      const out = await chatJSON(SYSTEM, user, { temperature: 0.6 });
      return normalize(out, scene, context);
    } catch (err) {
      console.warn(`promptAdapter: LLM echoue scene ${scene.scene_id} (${err.message}) -> fallback local`);
    }
  }
  return fallbackAdapted(scene, context);
}

export default { adaptScenePrompt, VALID_CAMERA, VALID_STYLE };
