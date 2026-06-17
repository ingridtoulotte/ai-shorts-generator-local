import { el } from "./primitives";

const STEPS = ["Prompt", "Storyboard", "Generation", "Audio", "Upscaling", "Export"];

export function stageToStep(stage: string): number {
  const s = (stage || "").toLowerCase();
  if (/script|scene[s]?$/.test(s) || s === "scenes") return 1;
  if (s === "scene" || s === "segment") return 2;
  if (s === "acoustic" || s.includes("audio")) return 3;
  if (s === "upscaling") return 4;
  if (s === "assemble" || s === "stitch" || s === "smooth") return 5;
  if (s === "done") return 6;
  return 0;
}

export function PipelineViz(activeStep: number): HTMLElement {
  return el("div.pipe", {}, ...STEPS.map((label, i) => {
    const cls = i < activeStep ? "done" : i === activeStep ? "active" : "pending";
    return el(`div.pipe-step.${cls}`, {},
      el("div.pipe-dot", {}, i < activeStep ? "✓" : String(i + 1)),
      el("div.pipe-label", {}, label));
  }));
}
