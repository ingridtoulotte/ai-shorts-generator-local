// Tiny hyperscript-style DOM builder. el("div.card", {onclick}, ...children)
type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

export function el<K extends keyof HTMLElementTagNameMap>(sel: K | string, props: Props = {}, ...children: Child[]): HTMLElement {
  const [tag, ...classes] = sel.split(".");
  const node = document.createElement(tag || "div");
  if (classes.length) node.className = classes.join(" ");
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = String(v);
    else if (k === "html") node.innerHTML = String(v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v as object);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "value") (node as HTMLInputElement).value = String(v);
    else if (k === "checked") (node as HTMLInputElement).checked = Boolean(v);
    else node.setAttribute(k, String(v));
  }
  for (const ch of children.flat()) {
    if (ch == null || ch === false) continue;
    node.append(ch instanceof Node ? ch : document.createTextNode(String(ch)));
  }
  return node;
}

export const clear = (n: HTMLElement): HTMLElement => { n.replaceChildren(); return n; };

export function button(label: string, opts: { variant?: string; icon?: string; onClick?: () => void; disabled?: boolean; tip?: string } = {}): HTMLElement {
  const b = el("button.btn" + (opts.variant ? "." + opts.variant : ""), {
    onclick: opts.onClick, disabled: opts.disabled, ...(opts.tip ? { class: `btn ${opts.variant ?? ""} tooltip`, "data-tip": opts.tip } : {}),
  }, opts.icon ? el("span", {}, opts.icon) : null, label);
  return b;
}

export function iconBtn(icon: string, opts: { onClick?: () => void; tip?: string; on?: boolean } = {}): HTMLElement {
  return el("button.icon-btn" + (opts.on ? ".on" : "") + (opts.tip ? ".tooltip" : ""),
    { onclick: opts.onClick, ...(opts.tip ? { "data-tip": opts.tip } : {}) }, icon);
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return el("div.field", {}, el("label", {}, label), control, hint ? el("div.hint", {}, hint) : null);
}

export function badge(text: string, kind: string): HTMLElement {
  return el(`span.badge.b-${kind}`, {}, text);
}

export function kv(k: string, v: string | HTMLElement): HTMLElement {
  return el("div.kv", {}, el("span.k", {}, k), typeof v === "string" ? el("span.v", {}, v) : el("span.v", {}, v));
}
