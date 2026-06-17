import { el, button } from "../components/primitives";
import { app } from "../stores/app";
import { api } from "../services/api";
import { QueueCard } from "../components/QueueCard";

export function mount(host: HTMLElement): () => void {
  const list = el("div.jobs");
  const bar = el("div.row", { style: { marginBottom: "16px" } });
  const render = () => {
    const st = app.get(); const jobs = st.snapshot.jobs;
    const active = jobs.filter((j) => j.status === "running" || j.status === "waiting");
    const done = jobs.filter((j) => j.status === "completed" || j.status === "failed" || j.status === "cancelled").reverse();
    const ordered = [...active, ...done];
    list.replaceChildren(...(ordered.length ? ordered.map(QueueCard)
      : [el("div.card.center.muted", { style: { padding: "40px" } }, "Queue is empty — add a job from Create.")]));
    const paused = st.snapshot.paused;
    bar.replaceChildren(
      button(paused ? "Resume" : "Pause", { icon: paused ? "▶️" : "⏸", onClick: () => (paused ? api.resume() : api.pause()) }),
      button("Cancel all", { icon: "⏹", onClick: () => api.cancelAll() }),
      button("Clear finished", { icon: "🧹", onClick: () => api.clearFinished() }));
  };
  const unsub = app.subscribe(render);
  host.replaceChildren(el("div", {}, bar, list));
  return unsub;
}
