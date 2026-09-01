import { UniverSlidesChartPlugin } from "@univerjs-pro/slides-chart";
import { UniverSlidesChartUIPlugin } from "@univerjs-pro/slides-chart-ui";
import { UniverSlidesTablePlugin } from "@univerjs-pro/slides-table";
import { UniverSlidesTableUIPlugin } from "@univerjs-pro/slides-table-ui";
import { UniverSlidesPlugin } from "@univerjs-pro/slides";
import { UniverSlidesUIPlugin } from "@univerjs-pro/slides-ui";
import type { Univer } from "@univerjs/core";
import { UniverDocsPlugin } from "@univerjs/docs";
import { UniverDocsUIPlugin } from "@univerjs/docs-ui";
import { UniverUIPlugin } from "@univerjs/ui";
import type { MountUniverEditorOptions } from "../../types";

import "@univerjs-pro/engine-chart/facade";
import "@univerjs-pro/slides-chart/facade";
import "@univerjs-pro/slides-table/facade";

export function registerSlideUnit(
  univer: Univer,
  options: MountUniverEditorOptions,
) {
  univer.registerPlugin(UniverUIPlugin, {
    container: options.container,
    ribbonType: "grid",
  });
  univer.registerPlugin(UniverDocsPlugin);
  univer.registerPlugin(UniverDocsUIPlugin);
  univer.registerPlugin(UniverSlidesPlugin);
  univer.registerPlugin(UniverSlidesUIPlugin);

  univer.registerPlugin(UniverSlidesChartPlugin);
  univer.registerPlugin(UniverSlidesChartUIPlugin);
  univer.registerPlugin(UniverSlidesTablePlugin);
  univer.registerPlugin(UniverSlidesTableUIPlugin);
}
