// ===============================================
// sceneplanner.js - split a script into 3-8 visual scenes
// Local LLM (Ollama/gemma4) with deterministic fallback.
// ===============================================

import { chatJSON, isAvailable } from "./ollama.js";

const SYSTEM = `Tu es un realisateur qui decoupe un script de video courte en scenes visuelles distinctes pour generation video par IA.
Reponds UNIQUEMENT en JSON strict avec ce format exact:
{"scenes":[{"scene_id":1,"narration":"texte parle pour cette scene (extrait exact du script)","visual_idea":"description concrete de ce qui doit etre montre a l'image: sujet, lieu, action, ambiance","duration_sec":4.5}]}
Regles strictes:
- Entre 3 et 8 scenes.
- La concatenation des "narration" dans l'ordre doit reconstituer le script complet, sans repetition ni omission, sans reformulation.
- "visual_idea" decrit l'image/la video a generer, PAS le texte parle. Sois concret: sujet principal, environnement, action visible, ambiance lumineuse.
- "duration_sec" = (nombre de mots de la narration) / 2.5, arrondi a 0.5 pres.
- Garde une coherence visuelle d'un meme sujet/style entre les scenes quand c'est pertinent.`;

// Deterministic fallback: chunk script lines into 3-8 groups.
function localScenes(script, durationSec) {
  const lines = String(script).split("\n").map((l) => l.trim()).filter(Boolean);
  const sceneCount = Math.max(3, Math.min(8, lines.length));
  const groups = Array.from({ length: sceneCount }, () => []);
  lines.forEach((line, i) => groups[i % sceneCount].push(line));

  const totalWords = lines.reduce((sum, l) => sum + l.split(/\s+/).filter(Boolean).length, 0) || 1;

  return groups
    .filter((g) => g.length)
    .map((g, i) => {
      const narration = g.join(" ");
      const words = narration.split(/\s+/).filter(Boolean).length;
      return {
        scene_id: i + 1,
        narration,
        visual_idea: `Scene illustrant: ${narration}`,
        duration_sec: Math.max(2, Math.round((words / totalWords) * durationSec * 2) / 2),
      };
    });
}

/**
 * planScenes - break a script into ordered visual scenes.
 * @param {string} script
 * @param {{durationSec?:number, minScenes?:number, maxScenes?:number}} [options]
 * @returns {Promise<Array<{scene_id:number, narration:string, visual_idea:string, duration_sec:number}>>}
 */
export async function planScenes(script, options = {}) {
  if (!script || !String(script).trim()) throw new Error("Script vide");
  const durationSec = Number(options.durationSec) || 30;

  if (await isAvailable()) {
    try {
      const user = `Script:\n${script}\n\nDuree totale cible: ${durationSec}s`;
      const out = await chatJSON(SYSTEM, user, { temperature: 0.6 });
      const scenes = Array.isArray(out.scenes) ? out.scenes : [];
      if (scenes.length < 1) throw new Error("aucune scene");
      return scenes.map((s, i) => ({
        scene_id: s.scene_id ?? i + 1,
        narration: String(s.narration || "").trim(),
        visual_idea: String(s.visual_idea || "").trim(),
        duration_sec: Number(s.duration_sec) || 4,
      })).filter((s) => s.narration);
    } catch (err) {
      console.warn(`sceneplanner: LLM echoue (${err.message}) -> fallback local`);
    }
  }
  return localScenes(script, durationSec);
}

export default { planScenes };
