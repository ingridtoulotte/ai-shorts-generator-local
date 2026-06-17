import { el } from "../components/primitives";
import { app } from "../stores/app";

const FEATURES = [
  ["🗂", "Creator queue", "Priority, reorder, ETA, retry, duplicate — one GPU, many jobs."],
  ["♾️", "Continuation", "Extend any clip seamlessly with carried-frame image-to-video."],
  ["🔊", "Smart audio", "Narration, SFX, or both — plus acoustic match on continuations."],
  ["✨", "Real-ESRGAN", "Optional 2× / 4× upscale to crisp 4K output."],
];

export function mount(host: HTMLElement): () => void {
  const c = app.get().caps;
  const repo = c?.engine === "ltx" ? "ai-shorts-generator-local-ltx" : "ai-shorts-generator-local";
  host.replaceChildren(el("div.work-narrow", {},
    el("div.card.glow.center", { style: { padding: "34px" } },
      el("div", { style: { fontSize: "44px" } }, "🎬"),
      el("h2", { style: { margin: "12px 0 4px" } }, "AI Shorts Studio"),
      el("p.muted", {}, "A fully-local text-to-video studio. No API keys, no cloud — Ollama, ComfyUI, and ffmpeg on your own GPU."),
      el("p", { style: { marginTop: "10px" } }, el("a", { href: `https://github.com/ingridtoulotte/${repo}`, target: "_blank" }, `github.com/ingridtoulotte/${repo}`))),
    el("div.grid-2", { style: { marginTop: "16px" } }, ...FEATURES.map(([em, h, d]) =>
      el("div.card", {}, el("div", { style: { fontSize: "22px" } }, em), el("h4", { style: { margin: "8px 0 4px" } }, h), el("p.muted", { style: { margin: "0", fontSize: "12.5px" } }, d))))));
  return () => {};
}
