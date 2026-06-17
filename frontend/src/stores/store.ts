// Minimal reactive store: immutable patch + subscribe. No framework needed.
export type Listener<T> = (state: T) => void;

export class Store<T extends object> {
  private state: T;
  private listeners = new Set<Listener<T>>();
  constructor(initial: T) { this.state = initial; }
  get(): T { return this.state; }
  set(patch: Partial<T> | ((s: T) => Partial<T>)): void {
    const p = typeof patch === "function" ? (patch as (s: T) => Partial<T>)(this.state) : patch;
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l(this.state);
  }
  subscribe(l: Listener<T>): () => void { this.listeners.add(l); l(this.state); return () => { this.listeners.delete(l); }; }
}
