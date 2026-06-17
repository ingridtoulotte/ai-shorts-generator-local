import "./styles.css";
import { el } from "./components/primitives";
import { app, type PanelId, pushLog } from "./stores/app";
import { Sidebar } from "./components/Sidebar";
import { RightPanel } from "./components/RightPanel";
import { toastHost } from "./components/Toast";
import { api } from "./services/api";
import { connectQueue } from "./services/sse";

import { mount as createMount } from "./panels/CreatePanel";
import { mount as queueMount } from "./panels/QueuePanel";
import { mount as historyMount } from "./panels/HistoryPanel";
import { mount as presetsMount } from "./panels/PresetsPanel";
import { mount as assetsMount } from "./panels/AssetsPanel";
import { mount as settingsMount } from "./panels/SettingsPanel";
import { mount as aboutMount } from "./panels/AboutPanel";

type Mount = (host: HTMLElement) => () => void;
const PANELS: Record<PanelId, { title: string; sub: string; mount: Mount }> = {
  create: { title: "Create", sub: "Turn an idea into a finished short", mount: createMount },
  queue: { title: "Queue", sub: "Your live generation pipeline", mount: queueMount },
  history: { title: "History", sub: "Everything you've generated", mount: historyMount },
  presets: { title: "Presets", sub: "Saved generation recipes", mount: presetsMount },
  assets: { title: "Assets", sub: "Rendered video library", mount: assetsMount },
  settings: { title: "Settings", sub: "Studio configuration", mount: settingsMount },
  about: { title: "About", sub: "AI Shorts Studio", mount: aboutMount },
};

const root = document.getElementById("app")!;
const wsTitle = el("h1");
const wsSub = el("span.sub");
const wsBody = el("div.work-body");

const mobileBtn = el("button.icon-btn", { onclick: () => app.set({ mobileOpen: !app.get().mobileOpen }) }, "☰");
const newBtn = el("button.btn.primary.sm", { onclick: () => app.set({ panel: "create" }) }, "✨ New");

const workspace = el("section.workspace", {},
  el("div.mobile-bar", {}, mobileBtn, el("strong", {}, "AI Shorts Studio")),
  el("header.topbar", {}, el("div", {}, wsTitle, el("div", {}, wsSub)), el("div.spacer"), newBtn),
  wsBody);

const shell = el("div.app", {}, Sidebar(), workspace, RightPanel());
const scrim = el("div");

root.replaceChildren(shell, scrim, toastHost());

// ---- panel routing ----
let cleanup: (() => void) | null = null;
let lastPanel: PanelId | null = null;
function routeTo(id: PanelId): void {
  if (id === lastPanel) return;
  lastPanel = id;
  cleanup?.(); cleanup = null;
  const def = PANELS[id];
  wsTitle.textContent = def.title; wsSub.textContent = def.sub;
  cleanup = def.mount(wsBody);
  wsBody.scrollTop = 0;
}

// ---- store -> shell classes ----
app.subscribe((st) => {
  document.documentElement.setAttribute("data-theme", st.theme);
  localStorage.setItem("theme", st.theme);
  shell.classList.toggle("sidebar-collapsed", st.sidebarCollapsed);
  shell.classList.toggle("right-hidden", st.rightHidden);
  shell.classList.toggle("mobile-open", st.mobileOpen);
  localStorage.setItem("sidebarCollapsed", String(st.sidebarCollapsed));
  localStorage.setItem("rightHidden", String(st.rightHidden));
  scrim.className = st.mobileOpen ? "scrim" : "";
  routeTo(st.panel);
});
scrim.addEventListener("click", () => app.set({ mobileOpen: false }));

// ---- live data ----
let logStages: Record<string, string> = {};
connectQueue((snap) => {
  for (const j of snap.jobs) {
    if (j.status === "running" && j.progress?.stage && logStages[j.id] !== j.progress.stage) {
      logStages[j.id] = j.progress.stage;
      pushLog(`[${j.label.slice(0, 28)}] ${j.progress.stage}${j.progress.pct ? ` ${j.progress.pct}%` : ""}`);
    }
    if (j.status === "completed" && logStages[j.id] !== "done") { logStages[j.id] = "done"; pushLog(`[${j.label.slice(0, 28)}] ✓ completed`); }
    if (j.status === "failed" && logStages[j.id] !== "failed") { logStages[j.id] = "failed"; pushLog(`[${j.label.slice(0, 28)}] ✗ ${j.error ?? "failed"}`); }
  }
  app.set({ snapshot: snap });
});

async function pollStats(): Promise<void> {
  try { app.set({ stats: await api.stats() }); } catch { /* offline */ }
  setTimeout(pollStats, 4000);
}
api.capabilities().then((caps) => app.set({ caps })).catch(() => {});
pollStats();
