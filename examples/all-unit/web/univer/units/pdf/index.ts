import { UniverPdfsPlugin } from "@univerjs-pro/pdfs";
import { UniverPdfEditorPlugin } from "@univerjs-pro/pdfs-editor";
import { UniverPdfsUIPlugin } from "@univerjs-pro/pdfs-ui";
import type { Univer } from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverPdfsExchangeClientPlugin } from "@univerjs-pro/pdfs-exchange-client";
import { UniverPdfsPrintPlugin } from "@univerjs-pro/pdfs-print";
import type { MountUniverEditorOptions } from "../../types";
import { registerCollaborationClient } from "../../collaboration";
import { exchangeClientConfig } from "../../config";
import { CustomPdfsImportExportPlugin } from "../../import-export/pdfs/plugin";

import "@univerjs-pro/pdfs/facade";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/pdfs-exchange-client/facade";

export function registerPdfUnit(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  // The ribbon stays on, as in the official PDF example: the import and export menu lives there.
  univer.registerPlugin(UniverUIPlugin, {
    container: options.container,
    ribbonType: "grid",
    footer: false,
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverPdfsPlugin);
  univer.registerPlugin(UniverPdfEditorPlugin);
  univer.registerPlugin(UniverPdfsUIPlugin);

  // collaboration
  registerCollaborationClient(univer);

  // Univer ships no comment or history UI for PDF.

  // print
  univer.registerPlugin(UniverPdfsPrintPlugin);

  // exchange
  univer.registerPlugin(UniverExchangeClientPlugin, exchangeClientConfig);
  univer.registerPlugin(UniverPdfsExchangeClientPlugin);
  univer.registerPlugin(CustomPdfsImportExportPlugin);
}
