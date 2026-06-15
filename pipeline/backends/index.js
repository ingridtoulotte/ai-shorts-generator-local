// ===============================================
// backends/index.js - generation engine selector
// "wan" (FLUX2 + Wan2.2, proven) or "ltx" (LTX 2.3, native audio)
// ===============================================

import { config } from "../config.js";
import wanBackend from "./wanBackend.js";
import stubBackend from "./stubBackend.js";

let ltxBackend = null;
try {
  ltxBackend = (await import("./ltxBackend.js")).default;
} catch {
  // LTX 2.3 backend not installed yet -> stay on wan.
}

export function getBackend() {
  if (config.engine === "stub") return stubBackend; // GPU-free testing
  if (config.engine === "ltx" && ltxBackend) return ltxBackend;
  if (config.engine === "ltx" && !ltxBackend) {
    console.warn("GEN_ENGINE=ltx mais pipeline/backends/ltxBackend.js absent -> fallback sur wan");
  }
  return wanBackend;
}

export default { getBackend };
