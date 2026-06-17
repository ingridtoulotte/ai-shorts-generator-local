import type { Snapshot } from "../types";

// Live queue stream via SSE, with a polling fallback if the stream drops.
export function connectQueue(onSnap: (s: Snapshot) => void): void {
  let poller: number | undefined;
  const poll = async () => {
    try { const r = await fetch("/queue"); onSnap(await r.json()); } catch { /* ignore */ }
    poller = window.setTimeout(poll, 2500);
  };
  try {
    const es = new EventSource("/events");
    es.onmessage = (e) => { try { onSnap(JSON.parse(e.data)); } catch { /* ignore */ } };
    es.onerror = () => { es.close(); if (poller === undefined) poll(); };
  } catch { poll(); }
}
