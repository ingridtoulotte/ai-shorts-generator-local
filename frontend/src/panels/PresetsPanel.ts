import { el, button, iconBtn } from "../components/primitives";
import { app } from "../stores/app";
import { toast } from "../components/Toast";

type Preset = { idea: string; voice: string; duration: string; priority: string; audioMode: string; upscale: number };

export function mount(host: HTMLElement): () => void {
  const list = el("div.jobs");
  const load = (): Record<string, Preset> => JSON.parse(localStorage.getItem("presets") || "{}");
  const render = () => {
    const all = load(); const names = Object.keys(all);
    list.replaceChildren(...(names.length ? names.map((name) => {
      const p = all[name];
      return el("div.jobcard", {}, el("div.jc-top", {},
        el("div.jc-thumb", {}, "💾"),
        el("div.jc-main", {}, el("div.jc-label", {}, name),
          el("div.jc-meta", {}, el("span.chip", {}, `${p.duration}s`), el("span.chip", {}, p.voice),
            el("span.chip", {}, p.audioMode), p.upscale >= 2 ? el("span.chip", {}, `${p.upscale}×`) : null)),
        el("div.jc-ctrl", {},
          button("Use", { variant: "sm", onClick: () => { app.set({ panel: "create" }); window.dispatchEvent(new CustomEvent("prefill-create", { detail: { ...p, durationSec: p.duration } })); } }),
          iconBtn("🗑", { tip: "Delete", onClick: () => { const a = load(); delete a[name]; localStorage.setItem("presets", JSON.stringify(a)); render(); toast("Deleted"); } }))));
    }) : [el("div.card.center.muted", { style: { padding: "40px" } }, "No presets yet. Save one from the Create panel.")]));
  };
  render();
  host.replaceChildren(el("div", {}, list));
  return () => {};
}
