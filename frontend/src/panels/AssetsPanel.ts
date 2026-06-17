import { el } from "../components/primitives";
import { app, completedJobs } from "../stores/app";

export function mount(host: HTMLElement): () => void {
  const grid = el("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: "14px" } });
  const render = () => {
    const jobs = completedJobs().reverse();
    grid.replaceChildren(...(jobs.length ? jobs.map((j) => {
      const v = el("video", { src: j.result!.videoUrl, muted: "", preload: "metadata", playsinline: "", controls: "",
        style: { width: "100%", borderRadius: "12px", background: "#000", cursor: "pointer" } });
      return el("div", {}, v, el("div.muted", { style: { fontSize: "11px", marginTop: "5px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, j.label));
    }) : [el("div.card.center.muted", { style: { padding: "40px" } }, "No rendered assets yet.")]));
  };
  const unsub = app.subscribe(render);
  host.replaceChildren(grid);
  return unsub;
}
