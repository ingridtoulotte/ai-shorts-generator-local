import type { Snapshot, Capabilities, Stats, UpscaleEstimate } from "../types";

async function json<T>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok || (data && (data as { error?: string }).error)) {
    throw new Error((data as { error?: string }).error || `HTTP ${r.status}`);
  }
  return data as T;
}
const post = (url: string, body?: unknown) =>
  json(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

export interface GeneratePayload { idea: string; voice: string; duration: number; priority: number; audioMode: string; upscale: number; }
export interface ContinuePayload { seedVideoUrl: string; idea: string; segments: number; segDurationSec: number; smooth: boolean; upscale: number; acousticMatch: boolean; }

export const api = {
  capabilities: () => json<Capabilities>("/api/capabilities"),
  stats: () => json<Stats>("/api/stats"),
  queue: () => json<Snapshot>("/queue"),
  upscaleEstimate: (scale: number, width: number, height: number, frames: number) =>
    json<UpscaleEstimate>(`/api/upscale-estimate?scale=${scale}&width=${width}&height=${height}&frames=${frames}`),
  generate: (p: GeneratePayload) => post("/generate", p),
  continue: (p: ContinuePayload) => post("/continue", p),
  pause: () => post("/queue/pause"),
  resume: () => post("/queue/resume"),
  cancelAll: () => post("/queue/cancel-all"),
  clearFinished: () => post("/queue/clear-finished"),
  jobAction: (id: string, action: string, body?: unknown) => post(`/queue/${id}/${action}`, body),
};
