// ===============================================
// scriptgen.js - hook-driven short script generation
// Local LLM (Ollama/gemma4) with deterministic fallback.
// Output language follows the selected voice (fr / en / es).
// ===============================================

import { chatJSON, isAvailable } from "./ollama.js";
import { config } from "./config.js";

// Per-language fallback narration + the language name fed to the LLM.
const LANG = {
  fr: {
    name: "français",
    lines: [
      "Voici ce que personne ne te dit.",
      "Le secret, c'est de commencer petit, mais de ne jamais s'arreter.",
      "Chaque jour compte. Chaque effort s'accumule.",
      "Alors agis maintenant, pas demain.",
      "Abonne-toi pour ne rien rater !",
    ],
  },
  en: {
    name: "English",
    lines: [
      "Here is what nobody tells you.",
      "The secret is to start small, but never stop.",
      "Every day counts. Every effort adds up.",
      "So act now, not tomorrow.",
      "Subscribe so you never miss out!",
    ],
  },
  es: {
    name: "español",
    lines: [
      "Esto es lo que nadie te dice.",
      "El secreto es empezar pequeno, pero nunca parar.",
      "Cada dia cuenta. Cada esfuerzo suma.",
      "Asi que actua ahora, no manana.",
      "Suscribete para no perderte nada!",
    ],
  },
};

// Map a UI voice code (fr / fr-female / en / es) to a script language.
export function langFromVoice(voice) {
  const v = String(voice || "fr").toLowerCase();
  if (v.startsWith("en")) return "en";
  if (v.startsWith("es")) return "es";
  return "fr";
}

function buildSystem(langName) {
  return `Tu es un scenariste expert de videos courtes virales (YouTube Shorts / TikTok / Reels).
Tu ecris des scripts de narration percutants: accroche forte des la premiere phrase, rythme rapide, conclusion avec appel a l'action.
Reponds UNIQUEMENT en JSON strict avec ce format exact:
{"title": "titre court", "hook": "premiere phrase d'accroche", "script": "texte complet a dire a voix haute, une idee par ligne, separe par \\n", "cta": "phrase d'appel a l'action finale"}
Le "script" doit inclure le hook comme premiere ligne et le cta comme derniere ligne.
Vise un debit d'environ 2.5 mots par seconde pour respecter la duree cible.
IMPORTANT: redige TOUS les textes (title, hook, script, cta) UNIQUEMENT en ${langName}.`;
}

function wordCount(text) {
  return String(text).trim().split(/\s+/).filter(Boolean).length;
}

// Trim a multi-line script down to a word budget, always keeping the final
// CTA line so the call-to-action survives. Keeps at least the hook + CTA.
function fitToWordBudget(script, maxWords) {
  const lines = String(script).split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) return lines.join("\n");
  const cta = lines[lines.length - 1];
  const ctaWords = wordCount(cta);
  const kept = [];
  let count = 0;
  for (const line of lines.slice(0, -1)) {
    const w = wordCount(line);
    if (kept.length >= 1 && count + w + ctaWords > maxWords) break;
    kept.push(line);
    count += w;
  }
  kept.push(cta);
  return kept.join("\n");
}

// Deterministic offline fallback (no LLM available).
function localScript(idea, durationSec, lang) {
  const clean = String(idea).trim().replace(/\s+/g, " ");
  const title = clean.charAt(0).toUpperCase() + clean.slice(1);
  const L = LANG[lang] || LANG.fr;
  const maxWords = Math.max(8, Math.round(durationSec * config.speechWordsPerSec));
  const script = fitToWordBudget([`${title}.`, ...L.lines].join("\n"), maxWords);
  const sLines = script.split("\n");
  return {
    title,
    hook: sLines[0],
    script,
    cta: sLines[sLines.length - 1],
    source: "local-fallback",
    lang,
  };
}

/**
 * generateScript - produce a hook-driven narration script for the idea,
 * in the language implied by the selected voice and sized to the duration.
 * @param {string} idea
 * @param {{durationSec?:number, platform?:string, voice?:string, lang?:string}} [options]
 * @returns {Promise<{title:string,hook:string,script:string,cta:string,source:string,lang:string}>}
 */
export async function generateScript(idea, options = {}) {
  if (!idea || !String(idea).trim()) throw new Error("Idee vide");
  const durationSec = Number(options.durationSec) || 30;
  const platform = options.platform || "YouTube Shorts / TikTok";
  const lang = options.lang || langFromVoice(options.voice);
  const langName = (LANG[lang] || LANG.fr).name;
  const maxWords = Math.max(8, Math.round(durationSec * config.speechWordsPerSec));

  if (await isAvailable()) {
    try {
      const user = `Idee de video: "${idea}"\nPlateforme: ${platform}\nLangue: ${langName}\nDuree cible: ${durationSec} secondes (~${maxWords} mots maximum).`;
      const out = await chatJSON(buildSystem(langName), user, { temperature: 0.8 });
      if (!out.script || !String(out.script).trim()) throw new Error("script manquant");
      const script = fitToWordBudget(String(out.script).trim(), maxWords);
      const sLines = script.split("\n");
      return {
        title: out.title || idea,
        hook: out.hook || sLines[0],
        script,
        cta: out.cta || sLines[sLines.length - 1],
        source: "gemma4",
        lang,
        wordCount: wordCount(script),
      };
    } catch (err) {
      console.warn(`scriptgen: LLM echoue (${err.message}) -> fallback local`);
    }
  }
  return localScript(idea, durationSec, lang);
}

export default { generateScript, langFromVoice };
