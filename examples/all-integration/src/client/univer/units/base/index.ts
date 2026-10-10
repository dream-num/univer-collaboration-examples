import { UniverBaseDashboardUIPlugin } from "@univerjs-pro/bases-dashboard-ui";
import { UniverBasesPlugin } from "@univerjs-pro/bases";
import { UniverBasesUIPlugin } from "@univerjs-pro/bases-ui";
import { IAttachmentIoService } from "@univerjs-pro/collaboration-client";
import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import type { Univer } from "@univerjs/core";
import { UniverRPCMainThreadPlugin } from "@univerjs/rpc";
import { UniverUIPlugin } from "@univerjs/ui";
import type { MountUniverEditorOptions } from "../../types";

import "@univerjs-pro/bases/facade";
import "@univerjs-pro/bases-dashboard/facade";
import "@univerjs-pro/bases-ui/facade";

export function registerBaseUnit(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  univer.registerPlugin(UniverUIPlugin, {
    container: options.container,
    ribbonType: "grid",
    toolbar: false,
    footer: false,
  });
  univer.registerPlugin(UniverProFormulaEnginePlugin, {
    notExecuteFormula: true,
  });
  univer.registerPlugin(UniverRPCMainThreadPlugin, {
    workerURL: new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    }),
  });
  univer.registerPlugin(UniverBasesPlugin);
  univer.registerPlugin(UniverBasesUIPlugin, {
    override: [[IAttachmentIoService, null]],
    workbench: {
      footer: false,
    },
  });
  univer.registerPlugin(UniverBaseDashboardUIPlugin);
}
