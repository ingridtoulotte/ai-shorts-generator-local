import { el, field, button } from "../components/primitives";
import { app, completedJobs } from "../stores/app";
import { api } from "../services/api";
import { toast } from "../components/Toast";
import { AudioModePicker } from "../components/AudioModePicker";
import { EmptyState } from "../components/EmptyState";

const VOICES = [["en", "🇬🇧 English"], ["fr", "🇫🇷 Français (m)"], ["fr-female", "🇫🇷 Français (f)"], ["es", "🇪🇸 Español"]];

export function mount(host: HTMLElement): () => void {
  let audioMode = app.get().caps?.audioModes.find((m) => m.recommended)?.id ?? "narration_sfx";
  let upscale = 0;

  const idea = el("textarea", { id: "idea", placeholder: "e.g. A small rusty robot wanders a vast abandoned city as rain falls…" }) as HTMLTextAreaElement;
  const voice = el("select", {}, ...VOICES.map(([v, l]) => el("option", { value: v }, l))) as HTMLSelectElement;
  const durVal = el("span.v", {}, "20s");
  const dur = el("input.range", { type: "range", min: "5", max: "90", value: "20" }) as HTMLInputElement;
  dur.oninput = () => (durVal.textContent = `${dur.value}s`);
  const prioVal = el("span.v", {}, "0");
  const prio = el("input.range", { type: "range", min: "0", max: "5", value: "0" }) as HTMLInputElement;
  prio.oninput = () => (prioVal.textContent = prio.value);

  const audioWrap = el("div");
  const renderAudio = () => audioWrap.replaceChildren(AudioModePicker(app.get().caps?.audioModes, audioMode, (id) => (audioMode = id)));
  renderAudio();

  const upEst = el("div.hint", {}, "");
  const upWrap = el("div.seg.cols-3");
  const paintUp = () => {
    const opts: [number, string][] = [[0, "Off"], [2, "2×"], [4, "4×"]];
    upWrap.replaceChildren(...opts.map(([v, lbl]) => el("div.seg-item" + (v === upscale ? ".active" : ""),
      { onclick: () => { upscale = v; paintUp(); estimate(); } }, el("div.t", {}, lbl))));
  };
  const estimate = async () => {
    if (upscale < 2) { upEst.textContent = "Native resolution — no upscale."; return; }
    const caps = app.get().caps; if (!caps) return;
    try {
      const e = await api.upscaleEstimate(upscale, caps.resolution.width, caps.resolution.height, Number(dur.value) * 16);
      upEst.textContent = `→ ${e.outWidth}×${e.outHeight} · ~${e.estSeconds}s · ~${e.estVramGB}GB VRAM (${e.engine})`;
    } catch { upEst.textContent = ""; }
  };
  paintUp(); estimate();

  const addBtn = button("Add to queue", { variant: "primary block", icon: "✨", onClick: async () => {
    const text = idea.value.trim(); if (!text) return toast("Enter an idea first", "err");
    (addBtn as HTMLButtonElement).disabled = true;
    try {
      await api.generate({ idea: text, voice: voice.value, duration: Number(dur.value), priority: Number(prio.value), audioMode, upscale });
      toast("Queued ✓"); app.set({ panel: "queue" });
    } catch (e) { toast((e as Error).message, "err"); } finally { (addBtn as HTMLButtonElement).disabled = false; }
  } });

  const savePreset = button("Save preset", { variant: "ghost sm", icon: "💾", onClick: () => {
    const name = prompt("Preset name?"); if (!name) return;
    const all = JSON.parse(localStorage.getItem("presets") || "{}");
    all[name] = { idea: idea.value, voice: voice.value, duration: dur.value, priority: prio.value, audioMode, upscale };
    localStorage.setItem("presets", JSON.stringify(all)); toast("Preset saved ✓");
  } });

  const createCard = el("div.card.glow", {},
    el("div.sec-title", {}, "✨ Create"),
    field("Idea", idea),
    el("div.row", {}, field("Language / voice", voice),
      field("Duration", el("div", {}, el("div.kv", {}, el("span.k", {}, "seconds"), durVal), dur))),
    field("Priority", el("div", {}, el("div.kv", {}, el("span.k", {}, "higher runs first"), prioVal), prio)),
    field("Audio", audioWrap),
    field("Real-ESRGAN upscale", el("div", {}, upWrap, upEst)),
    addBtn,
    el("div", { style: { marginTop: "10px" } }, savePreset));

  // ---- continuation ----
  const contSel = el("select", {}) as HTMLSelectElement;
  const segs = el("select", {}, ...["1", "3", "5", "10"].map((n) => el("option", {}, n))) as HTMLSelectElement;
  const segDurVal = el("span.v", {}, "5s");
  const segDur = el("input.range", { type: "range", min: "3", max: "10", value: "5" }) as HTMLInputElement;
  segDur.oninput = () => (segDurVal.textContent = `${segDur.value}s`);
  const smooth = el("input", { type: "checkbox" }) as HTMLInputElement;
  const acoustic = el("input", { type: "checkbox", checked: true }) as HTMLInputElement;
  let contSig = "";
  const refreshCont = () => {
    const done = completedJobs();
    const sig = done.map((j) => j.result!.videoUrl).join("|");
    if (sig === contSig) return; // nothing changed -> keep current selection
    contSig = sig;
    const keep = contSel.value;
    contSel.replaceChildren(el("option", { value: "" }, "— newest completed —"),
      ...done.map((j) => el("option", { value: j.result!.videoUrl }, j.label.slice(0, 44))));
    if (keep && done.some((j) => j.result!.videoUrl === keep)) contSel.value = keep;
  };
  refreshCont();
  const extendBtn = button("Extend video", { variant: "primary block", icon: "♾️", onClick: async () => {
    const done = completedJobs();
    const url = contSel.value || (done.length ? done[done.length - 1].result!.videoUrl : "");
    if (!url) return toast("No completed clip to extend", "err");
    try {
      await api.continue({ seedVideoUrl: url, idea: idea.value.trim() || "seamless continuation of the previous shot",
        segments: Number(segs.value), segDurationSec: Number(segDur.value), smooth: smooth.checked,
        upscale, acousticMatch: acoustic.checked });
      toast(`Extension queued (+${segs.value}) ✓`); app.set({ panel: "queue" });
    } catch (e) { toast((e as Error).message, "err"); }
  } });
  const check = (cb: HTMLInputElement, label: string) =>
    el("label.kv", { style: { cursor: "pointer" } }, el("span.k", {}, label), cb);

  const contCard = el("div.card", { style: { marginTop: "16px" } },
    el("div.sec-title", {}, "♾️ Continue / extend"),
    field("Source clip", contSel),
    el("div.row", {}, field("Segments", segs),
      field("Segment length", el("div", {}, el("div.kv", {}, el("span.k", {}, "seconds"), segDurVal), segDur))),
    check(acoustic, "Acoustic Match (match seed loudness)"),
    check(smooth, "Smooth seams (interpolation, slower)"),
    el("div", { style: { marginTop: "12px" } }, extendBtn));

  // ---- hero / preview ----
  const hero = el("div");
  let lastVideo: string | null | undefined = undefined;
  const renderHero = () => {
    const sel = app.get().selectedVideo;
    if (sel === lastVideo) return; lastVideo = sel;
    if (sel) {
      const v = el("video", { src: sel, controls: "", playsinline: "", autoplay: "" }) as HTMLVideoElement;
      hero.replaceChildren(el("div.fade-in", {},
        el("div.stage-video", {}, v),
        el("div.row", { style: { marginTop: "12px", maxWidth: "420px", margin: "12px auto 0" } },
          (() => { const a = el("a.btn", { href: sel, download: "" }, "⬇️ Download"); return a; })(),
          button("Continue this", { icon: "♾️", onClick: () => { contSel.value = sel; toast("Loaded into continuation ↓"); } }))));
    } else {
      hero.replaceChildren(EmptyState((t) => { idea.value = t; idea.focus(); }));
    }
  };

  window.addEventListener("prefill-create", prefill as EventListener);
  function prefill(e: CustomEvent): void {
    const p = e.detail as Record<string, unknown>;
    if (p.idea) idea.value = String(p.idea);
    if (p.voice) voice.value = String(p.voice);
    if (p.durationSec) { dur.value = String(p.durationSec); durVal.textContent = `${p.durationSec}s`; }
    if (p.audioMode) { audioMode = String(p.audioMode); renderAudio(); }
    if (p.upscale != null) { upscale = Number(p.upscale); paintUp(); estimate(); }
  }

  const unsub = app.subscribe(() => { renderHero(); refreshCont(); });
  host.replaceChildren(el("div.work-narrow", {}, hero, createCard, contCard));

  return () => { unsub(); window.removeEventListener("prefill-create", prefill as EventListener); };
}
