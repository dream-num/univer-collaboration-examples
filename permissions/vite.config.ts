import { defineConfig } from "vite";
export default defineConfig({
  build: { outDir: "dist/web", target: "es2022" },
  ssr: { noExternal: [/^@univerjs(?:-pro)?\//] },
});
