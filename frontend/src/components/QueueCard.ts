import { el, badge, iconBtn } from "./primitives";
import { api } from "../services/api";
import { app } from "../stores/app";
import { toast } from "./Toast";
import type { Job } from "../types";

function displayStatus(j: Job): string {
  if (j.status === "running") {
    const s = (j.progress?.stage || "").toLowerCase();
    if (s === "upscaling") return "upscaling";
    if (s === "acoustic") return "acoustic";
  }
  return j.status;
}

async function act(id: string, action: string, body?: unknown): Promise<void> {
  try { await api.jobAction(id, action, body); } catch (e) { toast((e as Error).message, "err"); }
}

function reEnqueue(j: Job): void {
  const p = j.params as Record<string, unknown>;
  if (j.type !== "generate") { toast("Only story jobs can be duplicated", "err"); return; }
  api.generate({
    idea: String(p.idea ?? j.label), voice: String(p.voice ?? "en"),
    duration: Number(p.durationSec ?? 20), priority: Number(j.priority ?? 0),
    audioMode: String(p.audioMode ?? "narration_sfx"), upscale: Number(p.upscale ?? 0),
  }).then(() => toast("Re-queued ✓")).catch((e) => toast((e as Error).message, "err"));
}

export function QueueCard(j: Job): HTMLElement {
  const st = displayStatus(j);
  const pctVal = j.progress?.pct ?? 0;
  const stage = j.progress?.stage ?? "";
  const params = j.params as Record<string, unknown>;

  const thumb = el("div.jc-thumb");
  if (j.result?.videoUrl) {
    const v = el("video", { src: j.result.videoUrl, muted: "", preload: "metadata", playsinline: "" }) as HTMLVideoElement;
    v.addEventListener("mouseenter", () => v.play().catch(() => {}));
    v.addEventListener("mouseleave", () => { v.pause(); v.currentTime = 0; });
    thumb.append(v);
  } else thumb.append(j.type === "continue" ? "♾️" : "🎬");

  const meta = el("div.jc-meta", {},
    el("span.chip", {}, j.type === "continue" ? "continuation" : "story"),
    params.durationSec ? el("span.chip", {}, `${params.durationSec}s`) : null,
    params.upscale && Number(params.upscale) >= 2 ? el("span.chip", {}, `${params.upscale}× upscale`) : null,
    j.attempts ? el("span.chip", {}, `retry ${j.attempts}`) : null,
    j.status === "waiting" && j.etaSec ? el("span.chip", {}, `ETA ~${j.etaSec}s`) : null);

  const ctrl = el("div.jc-ctrl");
  if (j.status === "waiting") ctrl.append(
    iconBtn("↑", { tip: "Up", onClick: () => act(j.id, "reorder", { direction: "up" }) }),
    iconBtn("↓", { tip: "Down", onClick: () => act(j.id, "reorder", { direction: "down" }) }),
    iconBtn("✏️", { tip: "Edit", onClick: () => { app.set({ panel: "create" }); window.dispatchEvent(new CustomEvent("prefill-create", { detail: j.params })); } }),
    iconBtn("✕", { tip: "Cancel", onClick: () => act(j.id, "cancel") }));
  else if (j.status === "running") ctrl.append(iconBtn("⏹", { tip: "Stop", onClick: () => act(j.id, "cancel") }));
  else if (j.status === "failed") ctrl.append(
    iconBtn("↻", { tip: "Retry", onClick: () => reEnqueue(j) }),
    iconBtn("🗑", { tip: "Remove", onClick: () => act(j.id, "remove") }));
  else {
    if (j.result?.videoUrl) ctrl.append(
      iconBtn("▶", { tip: "Preview", onClick: () => app.set({ selectedVideo: j.result!.videoUrl, panel: "create" }) }),
      iconBtn("⧉", { tip: "Duplicate", onClick: () => reEnqueue(j) }));
    ctrl.append(iconBtn("🗑", { tip: "Remove", onClick: () => act(j.id, "remove") }));
  }

  const top = el("div.jc-top", {}, thumb,
    el("div.jc-main", {}, el("div.jc-label", { title: j.label }, j.label), meta),
    el("div", {}, badge(st, st)));

  const card = el(`div.jobcard.${j.status}`, {}, top);
  if (j.status === "running" || j.status === "waiting") {
    const indet = j.status === "running" && pctVal < 2;
    card.append(el(`div.pbar${indet ? ".indet" : ""}`, {}, el("i", { style: { width: `${pctVal}%` } })),
      el("div.jc-stage", {}, el("span", {}, stage || (j.status === "waiting" ? "queued" : "starting")), el("span", {}, pctVal ? `${pctVal}%` : "")));
  }
  if (j.error) card.append(el("div.jc-stage", { style: { color: "var(--err)" } }, el("span", {}, j.error)));
  return card;
}
