import { defineConfig } from "vite";

export default defineConfig(({ isSsrBuild }) => ({
  define: {
    "import.meta.env.UNIVER_LICENSE": JSON.stringify(process.env["UNIVER_LICENSE"] ?? ""),
  },
  build: isSsrBuild
    ? {
        // One SSR build emits both entry points: dist/server/main.js (collaboration node)
        // and dist/server/exchange-main.js (import/export service).
        rollupOptions: {
          input: { main: "server/main.ts", "exchange-main": "server/exchange-main.ts" },
        },
      }
    : { outDir: "dist/web", target: "es2022" },
  ssr: { external: true },
}));
