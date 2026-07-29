import { defineConfig } from "vitest/config";

export default defineConfig({
  root: ".",
  test: {
    server: {
      deps: {
        inline: ["@univerjs-pro/engine-formula-rust"],
      },
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
});
