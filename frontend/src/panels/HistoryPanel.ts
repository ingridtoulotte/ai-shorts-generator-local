import { el, iconBtn } from "../components/primitives";
import { app, completedJobs } from "../stores/app";
import { api } from "../services/api";
import { toast } from "../components/Toast";
import { ago } from "../utils/format";
import type { Job } from "../types";

export function mount(host: HTMLElement): () => void {
  let q = "";
  const grid = el("div.jobs");
  const search = el("input", { type: "text", placeholder: "Search prompts…" }) as HTMLInputElement;
  search.oninput = () => { q = search.value.toLowerCase(); render(); };

  const card = (j: Job): HTMLElement => {
    const v = el("video", { src: j.result!.videoUrl, muted: "", preload: "metadata", playsinline: "" }) as HTMLVideoElement;
    v.addEventListener("mouseenter", () => v.play().catch(() => {}));
    v.addEventListener("mouseleave", () => { v.pause(); v.currentTime = 0; });
    const up = String((j.params as Record<string, unknown>).upscale ?? 0);
    return el("div.jobcard", {}, el("div.jc-top", {},
      el("div.jc-thumb", { style: { cursor: "pointer" }, onclick: () => app.set({ selectedVideo: j.result!.videoUrl, panel: "create" }) }, v),
      el("div.jc-main", {}, el("div.jc-label", {}, j.label),
        el("div.jc-meta", {}, el("span.chip", {}, ago(j.finishedAt ?? j.createdAt)),
          el("span.chip", {}, j.type === "continue" ? "continuation" : "story"),
          Number(up) >= 2 ? el("span.chip", {}, `${up}× upscale`) : null)),
      el("div.jc-ctrl", {},
        iconBtn("▶", { tip: "Open", onClick: () => app.set({ selectedVideo: j.result!.videoUrl, panel: "create" }) }),
        iconBtn("♾️", { tip: "Continue", onClick: () => app.set({ selectedVideo: j.result!.videoUrl, panel: "create" }) }),
        (() => el("a.icon-btn", { href: j.result!.videoUrl, download: "", title: "Export" }, "⬇️"))(),
        iconBtn("🗑", { tip: "Delete", onClick: () => api.jobAction(j.id, "remove").catch((e) => toast((e as Error).message, "err")) }))));
  };
  const render = () => {
    const jobs = completedJobs().filter((j) => j.label.toLowerCase().includes(q)).reverse();
    grid.replaceChildren(...(jobs.length ? jobs.map(card)
      : [el("div.card.center.muted", { style: { padding: "40px" } }, "No generated videos yet.")]));
  };
  const unsub = app.subscribe(render);
  host.replaceChildren(el("div", {}, el("div.field", {}, search), grid));
  return unsub;
}
