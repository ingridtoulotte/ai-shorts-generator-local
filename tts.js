// ===============================================
// tts.js - AI Shorts Generator
// TTS: local-first (Windows SAPI), optional PlayAI/Google
// ===============================================

import fs from "fs";
import path from "path";
import os from "os";
import axios from "axios";
import crypto from "crypto";
import { execFile } from "child_process";
import util from "util";

const execFileAsync = util.promisify(execFile);

const LOG_DIR = "./logs";
const AUDIO_DIR = "./audio";
const LOG_FILE = path.join(LOG_DIR, "tts.log");
[LOG_DIR, AUDIO_DIR].forEach((d) => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

function hashText(t) { return crypto.createHash("md5").update(t).digest("hex"); }

// Map UI voice codes -> installed Windows SAPI voice name substrings.
function pickSapiVoice(voice) {
  const v = String(voice || "fr").toLowerCase();
  if (v.startsWith("fr")) return v.includes("female") || v.includes("femme") ? "Hortense" : "Paul";
  if (v.startsWith("en")) return "Zira";
  if (v.startsWith("es")) return "Helena"; // may be absent -> default used
  return "Paul";
}

// Windows SAPI -> WAV. Fully local, no network, no API key.
async function sapiTTS(text, outWav, voice) {
  const wanted = pickSapiVoice(voice);
  // PowerShell script: select voice if available, else default; write WAV.
  const ps = `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
try { $v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -like '*${wanted}*' } | Select-Object -First 1; if ($v) { $s.SelectVoice($v.VoiceInfo.Name) } } catch {}
$s.Rate = 1
$s.SetOutputToWaveFile([System.IO.Path]::GetFullPath('${outWav.replace(/'/g, "''")}'))
$txt = [System.IO.File]::ReadAllText([System.IO.Path]::GetFullPath('${(outWav + ".txt").replace(/'/g, "''")}'))
$s.Speak($txt)
$s.Dispose()
`;
  // Pass text via a side file to avoid quoting/escaping issues.
  fs.writeFileSync(outWav + ".txt", text, "utf8");
  const psFile = outWav + ".ps1";
  fs.writeFileSync(psFile, ps, "utf8");
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile], { windowsHide: true });
  } finally {
    try { fs.unlinkSync(psFile); } catch {}
    try { fs.unlinkSync(outWav + ".txt"); } catch {}
  }
  if (!fs.existsSync(outWav) || fs.statSync(outWav).size === 0) throw new Error("SAPI: WAV vide");
  return outWav;
}

/**
 * generateTTS - synthesize speech to an audio file.
 * @param {string} text
 * @param {string} [outPath] desired output path (extension may change to .wav for SAPI)
 * @param {{voice?:string}} [options]
 * @returns {Promise<string>} actual audio file path
 */
export async function generateTTS(text, outPath, options = {}) {
  if (!text || !String(text).trim()) throw new Error("Texte TTS vide");
  const voice = options.voice || "fr";
  const base = outPath ? outPath.replace(/\.[^.]+$/, "") : path.join(AUDIO_DIR, hashText(text + voice));

  // 1) Optional PlayAI (only if key set)
  if (process.env.PLAYAI_API_KEY) {
    try {
      const mp3 = base + ".mp3";
      const r = await axios.post(
        "https://api.play.ht/api/v2/tts/stream",
        { text, voice },
        { responseType: "arraybuffer", headers: { Authorization: `Bearer ${process.env.PLAYAI_API_KEY}` }, timeout: 30000 }
      );
      fs.writeFileSync(mp3, Buffer.from(r.data));
      log(`PlayAI TTS -> ${mp3}`);
      return mp3;
    } catch (err) {
      log(`PlayAI echoue (${err.message}) -> fallback local`);
    }
  }

  // 2) Local Windows SAPI
  if (os.platform() === "win32") {
    const wav = base + ".wav";
    log(`SAPI TTS (voix ${voice}) -> ${wav}`);
    await sapiTTS(text, wav, voice);
    return wav;
  }

  throw new Error("Aucun moteur TTS local disponible (plateforme non-Windows et pas de cle PlayAI)");
}

export default { generateTTS };
