export const secs = (s: number): string => (s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`);
export const gb = (bytes: number): string => `${(bytes / 1e9).toFixed(1)}GB`;
export const pct = (n: number): string => `${Math.round(n)}%`;
export const ago = (ts: number): string => {
  const d = Math.round((Date.now() - ts) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
};
