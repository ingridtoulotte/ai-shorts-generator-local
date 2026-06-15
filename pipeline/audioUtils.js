// ===============================================
// audioUtils.js - small local WAV helpers (no ffprobe needed)
// ===============================================

import fs from "fs";

/**
 * wavDurationSec - read a PCM WAV header and compute duration in seconds.
 * @param {string} filePath
 * @returns {number} duration in seconds
 */
export function wavDurationSec(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Fichier WAV invalide: ${filePath}`);
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;

  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (chunkId === "fmt ") {
      channels = buf.readUInt16LE(body + 2);
      sampleRate = buf.readUInt32LE(body + 4);
      bitsPerSample = buf.readUInt16LE(body + 14);
    } else if (chunkId === "data") {
      dataSize = chunkSize;
    }

    offset = body + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (!sampleRate || !channels || !bitsPerSample || !dataSize) {
    throw new Error(`En-tete WAV incomplet: ${filePath}`);
  }
  return dataSize / (sampleRate * channels * (bitsPerSample / 8));
}

export default { wavDurationSec };
