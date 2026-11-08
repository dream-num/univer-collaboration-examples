import { UniverBaseDashboardUIPlugin } from "@univerjs-pro/bases-dashboard-ui";
import { UniverBasesPlugin } from "@univerjs-pro/bases";
import { UniverBasesUIPlugin } from "@univerjs-pro/bases-ui";
import { IAttachmentIoService } from "@univerjs-pro/collaboration-client";
import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import type { Univer } from "@univerjs/core";
import { UniverRPCMainThreadPlugin } from "@univerjs/rpc";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverBasesExchangeClientPlugin } from "@univerjs-pro/bases-exchange-client";
import { UniverBasesHistoryUIPlugin } from "@univerjs-pro/bases-history-ui";
import { UniverBasesThreadCommentUIPlugin } from "@univerjs-pro/bases-thread-comment-ui";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverThreadCommentDataSourcePlugin } from "@univerjs-pro/thread-comment-datasource";
import type { MountUniverEditorOptions } from "../../types";
import { registerCollaborationClient } from "../../collaboration";
import { exchangeClientConfig, historyConfig } from "../../config";
import { CustomBasesImportExportPlugin } from "../../import-export/bases/plugin";

import "@univerjs-pro/bases/facade";
import "@univerjs-pro/bases-dashboard/facade";
import "@univerjs-pro/bases-ui/facade";
import "@univerjs-pro/bases-exchange-client/facade";
import "@univerjs-pro/exchange-client/facade";

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

  // comment
  univer.registerPlugin(UniverBasesThreadCommentUIPlugin);

  // collaboration
  registerCollaborationClient(univer);
  univer.registerPlugin(UniverThreadCommentDataSourcePlugin);

  // history
  univer.registerPlugin(UniverBasesHistoryUIPlugin, historyConfig(options.container));

  // Univer ships no print for Base.

  // exchange
  univer.registerPlugin(UniverExchangeClientPlugin, exchangeClientConfig);
  univer.registerPlugin(UniverBasesExchangeClientPlugin);
  univer.registerPlugin(CustomBasesImportExportPlugin);
}
