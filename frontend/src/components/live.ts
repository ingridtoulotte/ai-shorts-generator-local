import { app } from "../stores/app";
import { el, clear } from "./primitives";

// A self-updating region: re-renders on every store change. Use only for
// display widgets (never for focusable inputs).
export function live(render: () => Node): { node: HTMLElement; stop: () => void } {
  const node = el("div");
  const stop = app.subscribe(() => { clear(node).append(render()); });
  return { node, stop };
}
