import { UniverBasesPlugin } from "@univerjs-pro/bases";
import BasesEnUS from "@univerjs-pro/bases/locale/en-US";
import { UniverBasesUIPlugin } from "@univerjs-pro/bases-ui";
import BasesUIEnUS from "@univerjs-pro/bases-ui/locale/en-US";
import { IAttachmentIoService } from "@univerjs-pro/collaboration-client";
import { UniverProFormulaEnginePlugin } from "@univerjs-pro/engine-formula";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import {
  IUniverInstanceService,
  IUndoRedoService,
  type ICreateUnitOptions,
  LocaleType,
  LogLevel,
  type Nullable,
  type UnitModel,
  Univer,
  UniverInstanceService,
  type UniverInstanceType,
} from "@univerjs/core";
import { UniverRenderEnginePlugin } from "@univerjs/engine-render";
import { UniverNetworkPlugin } from "@univerjs/network";
import { UniverRPCMainThreadPlugin } from "@univerjs/rpc";
import { mergeLocales } from "@univerjs/presets";
import { UniverUIPlugin } from "@univerjs/ui";
import UIEnUS from "@univerjs/ui/locale/en-US";
import {
  collaborationLocale,
  enforceReadOnlyReview,
  loadCurrentUser,
  registerRawCollaboration,
} from "../collaboration.js";
import { makeBaseSafeForCollaborationFormulaGuard } from "./base-compatibility.js";

import "@univerjs/ui/lib/index.css";
import "@univerjs-pro/bases-ui/lib/index.css";

import "@univerjs-pro/bases/facade";

const worker = new Worker(new URL("./base-worker.ts", import.meta.url), {
  type: "module",
});

// alpha.7 treats UNIVER_SHEET (0) as an omitted type filter, and its
// collaboration formula guard also resolves dirty-range Units without a type
// before assuming they are Workbooks. Remove this override and the Base model
// shim when those SDK call sites are type-safe.
class WorkspaceUniverInstanceService extends UniverInstanceService {
  override __addUnit(unit: UnitModel, options?: ICreateUnitOptions): void {
    makeBaseSafeForCollaborationFormulaGuard(unit);
    super.__addUnit(unit, options);
  }

  override getUnit<T extends UnitModel>(
    id: string,
    type?: UniverInstanceType
  ): Nullable<T> {
    const unit = super.getUnit<T>(id);
    return type !== undefined && unit?.type !== type ? null : unit;
  }
}

const univer = new Univer({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UIEnUS,
      BasesEnUS,
      BasesUIEnUS,
      collaborationLocale
    ),
  },
  logLevel: LogLevel.WARN,
  override: [
    [IUndoRedoService, null],
    [
      IUniverInstanceService,
      { useClass: WorkspaceUniverInstanceService },
    ],
  ],
});

univer.registerPlugin(UniverLicensePlugin, {
  license: import.meta.env.VITE_UNIVER_LICENSE || undefined,
});
univer.registerPlugin(UniverRenderEnginePlugin);
univer.registerPlugin(UniverProFormulaEnginePlugin, {
  notExecuteFormula: true,
});
univer.registerPlugin(UniverUIPlugin, {
  container: "univer-container",
  ribbonType: "grid",
});
univer.registerPlugin(UniverRPCMainThreadPlugin, { workerURL: worker });
univer.registerPlugin(UniverBasesPlugin);
univer.registerPlugin(UniverBasesUIPlugin, {
  override: [[IAttachmentIoService, null]],
});
univer.registerPlugin(UniverNetworkPlugin);
registerRawCollaboration(univer, { enableDocumentCollaborationUI: false });
enforceReadOnlyReview(univer);
univer.onDispose(() => worker.terminate());
void loadCurrentUser(univer);
