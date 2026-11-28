import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.mts"],
    // Univer SDK packages ship ESM `.js` files without `"type": "module"`, so Vitest would inline and
    // re-transform them on every run. Node loads them fine, so dependencies are left to Node.
    server: {
      deps: {
        external: [/\/node_modules\//],
      },
    },
    coverage: {
      include: ["src/**/*.ts"],
    },
  },
});
