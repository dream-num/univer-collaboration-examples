import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "import.meta.env.UNIVER_LICENSE": JSON.stringify(process.env["UNIVER_LICENSE"] ?? ""),
  },
  build: { outDir: "dist/web", target: "es2022" },
  ssr: { external: true },
});
