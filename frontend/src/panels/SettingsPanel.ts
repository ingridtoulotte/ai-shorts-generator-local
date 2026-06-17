import { el, kv, iconBtn } from "../components/primitives";
import { app } from "../stores/app";

export function mount(host: HTMLElement): () => void {
  const root = el("div.work-narrow");
  const render = () => {
    const st = app.get(); const c = st.caps;
    const toggle = (label: string, on: boolean, fn: () => void) =>
      el("div.kv", {}, el("span.k", {}, label), iconBtn(on ? "✅" : "⬜", { onClick: fn }));
    root.replaceChildren(
      el("div.card", {}, el("div.sec-title", {}, "🎨 Appearance"),
        toggle("Dark theme", st.theme === "dark", () => app.set({ theme: st.theme === "dark" ? "light" : "dark" })),
        toggle("Collapse sidebar", st.sidebarCollapsed, () => app.set({ sidebarCollapsed: !st.sidebarCollapsed })),
        toggle("Show info panel", !st.rightHidden, () => app.set({ rightHidden: !st.rightHidden }))),
      el("div.card", { style: { marginTop: "16px" } }, el("div.sec-title", {}, "🧠 Engine"),
        kv("Backend", c ? c.engine.toUpperCase() : "—"),
        kv("Native audio", c ? (c.nativeAudio ? "yes" : "no") : "—"),
        kv("Output resolution", c ? `${c.resolution.width}×${c.resolution.height}` : "—"),
        kv("Upscaler", c ? c.upscaler.label : "—"),
        kv("Real-ESRGAN", c ? (c.upscaler.realesrgan ? "available" : "lanczos fallback") : "—")),
      el("div.card", { style: { marginTop: "16px" } }, el("div.sec-title", {}, "💾 Data"),
        el("div.muted", { style: { fontSize: "12.5px" } }, "Presets and preferences are stored locally in your browser. Generated videos live in the server's output/ folder.")));
  };
  const unsub = app.subscribe(render);
  host.replaceChildren(root);
  return unsub;
}
