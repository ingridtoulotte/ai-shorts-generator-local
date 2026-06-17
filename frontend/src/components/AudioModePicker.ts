import { el } from "./primitives";
import type { AudioMode } from "../types";

const FALLBACK: AudioMode[] = [
  { id: "narration", label: "Full Narration", icon: "🎙", desc: "Speech only", tooltip: "", speak: true, ambience: false },
  { id: "sfx", label: "Full SFX", icon: "🔊", desc: "Ambient only", tooltip: "", speak: false, ambience: true },
  { id: "narration_sfx", label: "Narration + SFX", icon: "🎬", desc: "Speech + ambient", tooltip: "", speak: true, ambience: true, recommended: true },
];

export function AudioModePicker(modes: AudioMode[] | undefined, selected: string, onSelect: (id: string) => void): HTMLElement {
  const list = modes && modes.length ? modes : FALLBACK;
  const wrap = el("div.seg.cols-3");
  const paint = (sel: string) => wrap.replaceChildren(...list.map((m) =>
    el("div.seg-item" + (m.id === sel ? ".active" : "") + (m.tooltip ? ".tooltip" : ""),
      { onclick: () => { paint(m.id); onSelect(m.id); }, ...(m.tooltip ? { "data-tip": m.tooltip } : {}) },
      el("div.em", {}, m.icon), el("div.t", {}, m.label), el("div.d", {}, m.desc),
      m.recommended ? el("div.reco", {}, "RECOMMENDED") : null)));
  paint(selected);
  return wrap;
}
