import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula/worker";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsPivotTablePlugin } from "@univerjs-pro/sheets-pivot/worker";
import { LocaleType, Univer } from "@univerjs/core";
import { UniverRPCWorkerThreadPlugin } from "@univerjs/rpc/worker";
import { UniverRemoteSheetsFormulaPlugin } from "@univerjs/sheets-formula/worker";
import { UniverSheetsPlugin } from "@univerjs/sheets/worker";

// Formula engine for the edit history viewer, which never calculates on the main thread.
const univer = new Univer({
  locale: LocaleType.EN_US,
});

univer.registerPlugin(UniverLicensePlugin, {
  license: import.meta.env.UNIVER_LICENSE || undefined,
});
univer.registerPlugin(UniverProFormulaEnginePlugin);
univer.registerPlugin(UniverSheetsPlugin, { onlyRegisterFormulaRelatedMutations: true });
// The viewer's pivot plugin syncs its mutations here. Register it before the RPC plugin, or the first
// messages arrive before its mutations exist and are reported as unregistered.
univer.registerPlugin(UniverSheetsPivotTablePlugin, { notExecuteFormula: false });
univer.registerPlugin(UniverRPCWorkerThreadPlugin);
univer.registerPlugin(UniverRemoteSheetsFormulaPlugin);

(globalThis as typeof globalThis & { univer: Univer }).univer = univer;
