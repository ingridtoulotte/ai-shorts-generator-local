// ===============================================
// groq.js - AI Shorts Generator
// Script generation: local-first, optional Groq API
// ===============================================

import axios from "axios";
import fs from "fs";
import path from "path";

const LOG_DIR = "./logs";
const LOG_FILE = path.join(LOG_DIR, "groq.log");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

// Real Groq (OpenAI-compatible chat endpoint). Used only if GROQ_API_KEY set.
export async function queryGroq(prompt, options = {}) {
  const model = options.model || "llama-3.1-8b-instant";
  const maxTokens = options.maxTokens || 400;
  const temperature = options.temperature ?? 0.8;

  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model,
      messages: [
        { role: "system", content: "Tu ecris des scripts courts, punchy et dynamiques pour des videos YouTube Shorts / TikTok. Reponds uniquement avec le texte a dire a voix haute, sans didascalies." },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
      temperature,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    }
  );
  const out = res.data?.choices?.[0]?.message?.content?.trim();
  if (!out) throw new Error("Groq: reponse vide");
  return out;
}

// Local deterministic script generator (zero key, works offline).
function localScript(idea, durationSec = 20) {
  const clean = String(idea).trim().replace(/\s+/g, " ");
  const title = clean.charAt(0).toUpperCase() + clean.slice(1);
  // ~3 words/sec spoken -> target word budget. Keep 4-6 lines.
  const lines = [
    `${title}.`,
    `Voici ce que personne ne te dit.`,
    `Le secret, c'est de commencer petit, mais de ne jamais s'arreter.`,
    `Chaque jour compte. Chaque effort s'accumule.`,
    `Alors agis maintenant, pas demain.`,
    `Abonne-toi pour ne rien rater !`,
  ];
  // Trim line count roughly to duration (about 4s per line).
  const keep = Math.max(3, Math.min(lines.length, Math.round(durationSec / 4)));
  return lines.slice(0, keep).join("\n");
}

/**
 * generateScript - returns spoken text for the short.
 * Uses Groq if GROQ_API_KEY is set, otherwise a local generator.
 * @param {string} idea
 * @param {{durationSec?:number, model?:string}} options
 * @returns {Promise<string>}
 */
export async function generateScript(idea, options = {}) {
  if (!idea || !String(idea).trim()) throw new Error("Idee vide");
  const durationSec = Number(options.durationSec) || 20;

  if (process.env.GROQ_API_KEY) {
    try {
      log(`Groq: generation script pour "${String(idea).slice(0, 50)}"`);
      const prompt = `Ecris un script de narration pour un YouTube Short d'environ ${durationSec} secondes sur le sujet: "${idea}". Style punchy, accroche forte des la premiere phrase, termine par un call-to-action.`;
      const out = await queryGroq(prompt, options);
      log("Groq: script recu");
      return out;
    } catch (err) {
      log(`Groq echoue (${err.message}) -> fallback local`);
    }
  } else {
    log("GROQ_API_KEY absente -> generateur local");
  }
  return localScript(idea, durationSec);
}

export default { generateScript, queryGroq };
