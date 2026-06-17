import { Store } from "./store";
import type { Snapshot, Capabilities, Stats, Job } from "../types";

export type PanelId = "create" | "queue" | "history" | "presets" | "assets" | "settings" | "about";

export interface AppState {
  panel: PanelId;
  theme: "dark" | "light";
  sidebarCollapsed: boolean;
  rightHidden: boolean;
  mobileOpen: boolean;
  snapshot: Snapshot;
  caps: Capabilities | null;
  stats: Stats | null;
  logs: string[];
  selectedVideo: string | null;
}

const saved = (k: string, d: string) => localStorage.getItem(k) ?? d;

export const app = new Store<AppState>({
  panel: "create",
  theme: saved("theme", "dark") === "light" ? "light" : "dark",
  sidebarCollapsed: localStorage.getItem("sidebarCollapsed") === "true",
  rightHidden: localStorage.getItem("rightHidden") === "true",
  mobileOpen: false,
  snapshot: { paused: false, avgSec: 0, jobs: [] },
  caps: null,
  stats: null,
  logs: [],
  selectedVideo: null,
});

export function pushLog(line: string): void {
  const logs = [...app.get().logs, `${new Date().toLocaleTimeString()}  ${line}`].slice(-120);
  app.set({ logs });
}
export function runningJob(): Job | undefined { return app.get().snapshot.jobs.find((j) => j.status === "running"); }
export function completedJobs(): Job[] { return app.get().snapshot.jobs.filter((j) => j.status === "completed" && j.result?.videoUrl); }
