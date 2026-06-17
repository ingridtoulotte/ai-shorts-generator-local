import { el } from "./primitives";

const EXAMPLES = [
  "A rusty robot finds a glowing flower in an abandoned city",
  "Why the ocean glows at night — explained in 30s",
  "Tiny construction workers build roads on a giant burger",
  "The most isolated village on Earth, from above",
  "3 habits that quietly change your life",
];
const TIPS = [
  ["⚡", "Be specific", "Concrete subjects + a clear action generate the sharpest shots."],
  ["⏱", "Pick a length", "5–30s reads best as a short; longer needs more scenes."],
  ["🎬", "Mix audio", "Narration + SFX is the most cinematic default."],
];

export function EmptyState(onExample: (t: string) => void): HTMLElement {
  return el("div.fade-in", {},
    el("div.empty-hero", {},
      el("div.big", {}, "🎬"),
      el("h2", {}, "Create a short from a single idea"),
      el("p", {}, "Type a prompt, queue it, and the local pipeline turns it into a finished vertical video — fully on your GPU."),
      el("div.chips", {}, ...EXAMPLES.map((ex) => el("button.chip-ex", { onclick: () => onExample(ex) }, ex)))),
    el("div.tips", {}, ...TIPS.map(([em, h, d]) => el("div.tip", {}, el("div.em", {}, em), el("h4", {}, h), el("p", {}, d)))));
}
