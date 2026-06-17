// ===============================================
// audioModes.js - human-friendly audio modes shared by API + UI + pipeline.
// Replaces the old opaque A/B/C/D switches with named, explained modes.
// Legacy single letters still resolve for backward compatibility.
// ===============================================

export const AUDIO_MODES = [
  {
    id: "narration", label: "Full Narration", icon: "🎙",
    desc: "Speech only. Best for storytelling.",
    tooltip: "Spoken narration drives the clip. No ambient sound layer.",
    speak: true, ambience: false,
  },
  {
    id: "sfx", label: "Full SFX", icon: "🔊",
    desc: "Ambient sound only. No narration.",
    tooltip: "Environmental / cinematic sound, no voice. Best for mood clips.",
    speak: false, ambience: true,
  },
  {
    id: "narration_sfx", label: "Narration + SFX", icon: "🎬",
    desc: "Speech mixed with environmental sound.",
    tooltip: "Recommended. Narration over a matched ambient bed.",
    speak: true, ambience: true, recommended: true,
  },
];

const BY_ID = Object.fromEntries(AUDIO_MODES.map((m) => [m.id, m]));

// Legacy A/B/C/D -> named ids.
const LEGACY = { A: "narration", B: "sfx", C: "narration_sfx", D: "narration_sfx" };

const DEFAULT = "narration_sfx";

/** Resolve any accepted mode value (named id or legacy letter) to a mode object. */
export function resolveAudioMode(mode) {
  if (!mode) return BY_ID[DEFAULT];
  const key = String(mode).trim();
  if (BY_ID[key]) return BY_ID[key];
  const up = key.toUpperCase();
  if (LEGACY[up]) return BY_ID[LEGACY[up]];
  return BY_ID[DEFAULT];
}

export default { AUDIO_MODES, resolveAudioMode };
