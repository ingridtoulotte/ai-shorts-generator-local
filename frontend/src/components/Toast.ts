import { el } from "./primitives";

let host: HTMLElement | null = null;
export function toastHost(): HTMLElement { return host ??= el("div.toasts"); }

export function toast(msg: string, kind: "ok" | "err" = "ok"): void {
  const t = el(`div.toast.${kind}`, {}, msg);
  toastHost().append(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 300); }, 3800);
}
