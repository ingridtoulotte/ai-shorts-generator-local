export type JobStatus = "waiting" | "running" | "completed" | "failed" | "cancelled";
export type JobType = "generate" | "continue";

export interface JobProgress { pct: number; stage: string; phase?: string; engine?: string; segment?: number; total?: number; }
export interface JobResult { videoUrl: string; script?: unknown; }
export interface Job {
  id: string; type: JobType; status: JobStatus; priority: number; label: string;
  params: Record<string, unknown>; progress: JobProgress; error: string | null;
  result: JobResult | null; attempts: number;
  createdAt: number; startedAt: number | null; finishedAt: number | null; etaSec?: number;
}
export interface Snapshot { paused: boolean; avgSec: number; jobs: Job[]; }

export interface AudioMode { id: string; label: string; icon: string; desc: string; tooltip: string; speak: boolean; ambience: boolean; recommended?: boolean; }
export interface Capabilities {
  engine: string; nativeAudio: boolean;
  upscaler: { label: string; realesrgan: boolean; scales: number[] };
  audioModes: AudioMode[];
  resolution: { width: number; height: number };
}
export interface UpscaleEstimate { engine: string; outWidth: number; outHeight: number; estSeconds: number; estVramGB: number; }
export interface Stats { ok: boolean; gpu: string; vramTotal?: number; vramFree?: number; vramUsed?: number; }
