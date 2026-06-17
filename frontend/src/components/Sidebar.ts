import { el, iconBtn } from "./primitives";
import { app, type PanelId } from "../stores/app";

const NAV: { id: PanelId; icon: string; label: string }[] = [
  { id: "create", icon: "✨", label: "Create" },
  { id: "queue", icon: "🗂", label: "Queue" },
  { id: "history", icon: "🕘", label: "History" },
  { id: "presets", icon: "💾", label: "Presets" },
  { id: "assets", icon: "🎞", label: "Assets" },
  { id: "settings", icon: "⚙️", label: "Settings" },
  { id: "about", icon: "ℹ️", label: "About" },
];

export function Sidebar(): HTMLElement {
  const nav = el("nav.nav");
  const foot = el("div.side-foot");

  const subEl = el("small", {}, "Local studio");

  const render = () => {
    const st = app.get();
    subEl.textContent = st.caps?.engine === "ltx" ? "LTX 2.3 · native audio" : st.caps?.engine === "wan" ? "Wan 2.2 · FLUX2" : "Local studio";
    nav.replaceChildren(...NAV.map((n) => {
      const active = st.panel === n.id;
      const count = n.id === "queue" ? st.snapshot.jobs.filter((j) => j.status === "waiting" || j.status === "running").length : 0;
      return el("button.nav-item" + (active ? ".active" : ""), { onclick: () => app.set({ panel: n.id, mobileOpen: false }) },
        el("span.ic", {}, n.icon), el("span", {}, n.label),
        count ? el("span.count", {}, String(count)) : null);
    }));
    foot.replaceChildren(
      iconBtn(st.theme === "dark" ? "🌙" : "☀️", { tip: "Theme", onClick: () => app.set({ theme: st.theme === "dark" ? "light" : "dark" }) }),
      iconBtn("⇔", { tip: "Collapse", onClick: () => app.set({ sidebarCollapsed: !st.sidebarCollapsed }) }),
      iconBtn(st.rightHidden ? "▦" : "▥", { tip: "Info panel", on: !st.rightHidden, onClick: () => app.set({ rightHidden: !st.rightHidden }) }),
    );
  };
  app.subscribe(render);

  return el("aside.sidebar", {},
    el("div.brand", {}, el("div.logo", {}, "🎬"), el("div.name", {}, "AI Shorts", subEl)),
    nav, foot);
}
