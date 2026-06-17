import { el, kv } from "./primitives";
import { app, runningJob } from "../stores/app";
import { gb } from "../utils/format";
import { PipelineViz, stageToStep } from "./PipelineViz";

export function RightPanel(): HTMLElement {
  const root = el("aside.rightpanel");
  const render = () => {
    const st = app.get();
    const s = st.stats; const run = runningJob();
    const vramPct = s?.vramTotal ? ((s.vramUsed ?? 0) / s.vramTotal) * 100 : 0;
    const waiting = st.snapshot.jobs.filter((j) => j.status === "waiting").length;
    const step = run ? stageToStep(run.progress?.stage || "") : 0;

    root.replaceChildren(
      el("div.card", {},
        el("h3.panel-h", {}, "System"),
        kv("GPU", s?.gpu || "—"),
        el("div.kv", {}, el("span.k", {}, "VRAM"), el("span.v", {}, s?.vramTotal ? `${gb(s.vramUsed ?? 0)} / ${gb(s.vramTotal)}` : "—")),
        el("div.meter", { style: { marginTop: "4px" } }, el("i", { style: { width: `${vramPct}%` } })),
        st.caps ? kv("Upscaler", st.caps.upscaler.label) : null,
        st.caps ? kv("Engine", st.caps.engine.toUpperCase()) : null),

      el("div.card", {},
        el("h3.panel-h", {}, "Pipeline"),
        PipelineViz(step),
        el("hr.divider"),
        kv("Status", run ? (run.progress?.stage || "running") : st.snapshot.paused ? "paused" : waiting ? `${waiting} queued` : "idle"),
        run && run.etaSec ? kv("ETA", `~${run.etaSec}s`) : kv("Avg / job", st.snapshot.avgSec ? `~${st.snapshot.avgSec}s` : "—")),

      el("div.card", {},
        el("h3.panel-h", {}, "Generation logs"),
        el("div.logbox", {}, ...(st.logs.length ? st.logs.slice(-60).map((l) => el("div", {}, l)) : [el("div.muted", {}, "Waiting for activity…")]))),
    );
    const lb = root.querySelector(".logbox"); if (lb) lb.scrollTop = lb.scrollHeight;
  };
  app.subscribe(render);
  return root;
}
