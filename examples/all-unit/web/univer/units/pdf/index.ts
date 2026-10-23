import { UniverPdfsPlugin } from "@univerjs-pro/pdfs";
import { UniverPdfEditorPlugin } from "@univerjs-pro/pdfs-editor";
import { UniverPdfsUIPlugin } from "@univerjs-pro/pdfs-ui";
import type { Univer } from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import type { MountUniverEditorOptions } from "../../types";

import "@univerjs-pro/pdfs/facade";

export function registerPdfUnit(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  univer.registerPlugin(UniverUIPlugin, {
    container: options.container,
    ribbonType: "grid",
    header: false,
    toolbar: false,
    footer: false,
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverPdfsPlugin);
  univer.registerPlugin(UniverPdfEditorPlugin);
  univer.registerPlugin(UniverPdfsUIPlugin);
}
