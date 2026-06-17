import { defineConfig } from "vite";

// Single-page app served by the Express backend.
// `npm run build` emits to ../dist, which index.js serves in production.
// `npm run dev` proxies API calls to the running backend on :3000.
const API = ["/generate", "/continue", "/queue", "/events", "/api", "/output"];

export default defineConfig({
  root: "frontend",
  base: "./",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(API.map((p) => [p, { target: "http://localhost:3000", changeOrigin: true }])),
  },
});
