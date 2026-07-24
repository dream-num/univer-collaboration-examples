import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import { UniverSheetsPivotTablePlugin } from "@univerjs-pro/sheets-pivot";
import { LocaleType, LogLevel, Univer } from "@univerjs/core";
import { UniverRPCWorkerThreadPlugin } from "@univerjs/rpc";
import { UniverSheetsPlugin } from "@univerjs/sheets";
import SheetsEnUS from "@univerjs/sheets/locale/en-US";
import { UniverSheetsFilterPlugin } from "@univerjs/sheets-filter";
import { UniverRemoteSheetsFormulaPlugin } from "@univerjs/sheets-formula";

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: SheetsEnUS,
  },
  logLevel: LogLevel.VERBOSE,
});

univer.registerPlugin(UniverLicensePlugin, {
  license: import.meta.env.VITE_UNIVER_LICENSE || undefined,
});
univer.registerPlugin(UniverSheetsPlugin, {
  onlyRegisterFormulaRelatedMutations: true,
});
univer.registerPlugin(UniverProFormulaEnginePlugin);
univer.registerPlugin(UniverRPCWorkerThreadPlugin);
univer.registerPlugin(UniverRemoteSheetsFormulaPlugin);
univer.registerPlugin(UniverSheetsFilterPlugin);
univer.registerPlugin(UniverSheetsPivotTablePlugin, {
  notExecuteFormula: false,
});
