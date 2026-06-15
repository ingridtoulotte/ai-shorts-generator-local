// ===============================================
// ollama.js - local LLM client (Ollama)
// ===============================================

import axios from "axios";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
export const LLM_MODEL = process.env.LLM_MODEL || "gemma4";

// Strip ```json fences some models add despite format:"json".
function extractJSON(text) {
  const trimmed = String(text).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

/**
 * chatJSON - call the local LLM and parse a strict JSON response.
 * @param {string} system - system prompt
 * @param {string} user - user prompt
 * @param {{model?:string, temperature?:number, retries?:number}} [opts]
 * @returns {Promise<any>}
 */
export async function chatJSON(system, user, opts = {}) {
  const model = opts.model || LLM_MODEL;
  const temperature = opts.temperature ?? 0.7;
  const retries = opts.retries ?? 2;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await axios.post(
        `${OLLAMA_URL}/api/chat`,
        {
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          format: "json",
          stream: false,
          options: { temperature },
        },
        { timeout: 180000 }
      );
      const content = res.data?.message?.content;
      if (!content) throw new Error("Reponse LLM vide");
      return extractJSON(content);
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Ollama chatJSON echoue (${model}): ${lastErr.message}`);
}

/**
 * isAvailable - quick check that Ollama is reachable.
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  try {
    await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export default { chatJSON, isAvailable, LLM_MODEL };
