import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const exampleDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");
const moduleLoadTimeout = 15_000;

describe("basic-sheets server module loading", () => {
  it(
    "does not initialize Univer dependency identifiers twice",
    () => {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          "await import('./server/application.ts')",
        ],
        {
          cwd: exampleDirectory,
          encoding: "utf8",
          killSignal: "SIGKILL",
          timeout: moduleLoadTimeout,
        }
      );

      if (result.error !== undefined) {
        throw new Error("Unable to load the basic-sheets server module.", {
          cause: result.error,
        });
      }
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).not.toContain(
        "already exists. Returning the cached identifier decorator."
      );
    },
    moduleLoadTimeout + 5_000
  );
});
