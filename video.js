// ===============================================
// video.js - AI Shorts Generator
// Assemble a vertical short with ffmpeg-static (fully local)
// ===============================================

import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import util from "util";
import ffmpegStatic from "ffmpeg-static";

const execFileAsync = util.promisify(execFile);
const FFMPEG = ffmpegStatic;

const OUTPUT_DIR = path.join(process.cwd(), "output");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Escape a filesystem path for use inside an ffmpeg filtergraph option.
function escFilterPath(p) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

// Pick a bold TTF available on the platform.
function pickFont() {
  const candidates = os.platform() === "win32"
    ? ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"]
    : ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

// Word-wrap text to ~maxChars per line for big readable captions.
function wrapText(text, maxChars = 22) {
  const out = [];
  for (const para of String(text).split(/\n+/)) {
    let line = "";
    for (const word of para.trim().split(/\s+/)) {
      if (!word) continue;
      if ((line + " " + word).trim().length > maxChars) {
        if (line) out.push(line);
        line = word;
      } else {
        line = (line + " " + word).trim();
      }
    }
    if (line) out.push(line);
  }
  return out.join("\n");
}

/**
 * createVideo - render a 1080x1920 mp4 from an audio track + caption text.
 * @param {{audioPath:string, text?:string, outputName?:string}} opts
 * @returns {Promise<string>} output mp4 path
 */
export async function createVideo({ audioPath, text = "", outputName } = {}) {
  if (!audioPath || !fs.existsSync(audioPath)) throw new Error("Fichier audio introuvable: " + audioPath);

  const name = outputName || `short-${Date.now()}.mp4`;
  const outputPath = path.join(OUTPUT_DIR, name);
  const font = pickFont();

  // Caption text -> temp file (avoids filtergraph quoting hell).
  const txtFile = path.join(OUTPUT_DIR, path.parse(name).name + ".caption.txt");
  fs.writeFileSync(txtFile, wrapText(text), "utf8");

  let drawtext = "";
  if (font && String(text).trim()) {
    drawtext =
      `,drawtext=fontfile='${escFilterPath(font)}':textfile='${escFilterPath(txtFile)}'` +
      `:fontcolor=white:fontsize=56:line_spacing=16:expansion=none` +
      `:box=1:boxcolor=black@0.5:boxborderw=34` +
      `:x=(w-text_w)/2:y=(h-text_h)/2`;
  }

  const args = [
    "-y",
    "-f", "lavfi", "-i", "color=c=0x0f1226:s=1080x1920:r=30",
    "-i", audioPath,
    "-filter_complex", `[0:v]format=yuv420p${drawtext}[v]`,
    "-map", "[v]", "-map", "1:a",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-b:v", "4M",
    "-c:a", "aac", "-b:a", "192k",
    "-shortest",
    outputPath,
  ];

  console.log("Rendu ffmpeg ->", outputPath);
  await execFileAsync(FFMPEG, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 64 });

  try { fs.unlinkSync(txtFile); } catch {}
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) throw new Error("Sortie video vide");
  console.log("Video OK:", outputPath);
  return outputPath;
}

export default { createVideo };
