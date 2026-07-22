import {
  IPermissionService,
  UniverInstanceType,
} from "@univerjs/core";
import {
  CollaborationEvent,
  RevertRevisionMutation,
  type INewChangesetsEvent,
  UniverCollaborationPlugin,
} from "@univerjs-pro/collaboration";
import {
  CollaborationController,
  ILocalCacheService,
  UniverCollaborationClientPlugin,
} from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import "@univerjs-pro/collaboration-client/facade";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverEditHistoryLoaderPlugin } from "@univerjs-pro/edit-history-loader";
import EditHistoryLoaderEnUS from "@univerjs-pro/edit-history-loader/locale/en-US";
import EditHistoryViewerEnUS from "@univerjs-pro/edit-history-viewer/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  type FUniver,
  LocaleType,
  mergeLocales,
} from "@univerjs/presets";
import {
  WorkbookRecoverHistoryPermission,
  WorkbookViewHistoryPermission,
} from "@univerjs/sheets";

import "@univerjs/preset-sheets-core/lib/index.css";

export async function openCollaborativeSheet(
  unitID: string,
  onStatus: (status: string) => void
): Promise<void> {
  const websocketOrigin = location.origin.replace(/^http/, "ws");
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        CollaborationClientEnUS,
        CollaborationClientUIEnUS,
        EditHistoryLoaderEnUS,
        EditHistoryViewerEnUS
      ),
    },
    theme: defaultTheme,
    collaboration: true,
    presets: [
      UniverSheetsCorePreset({
        container: "app",
        menu: {
          "sheet.command.add-range-protection-from-toolbar": { hidden: true },
          "sheet.contextMenu.permission": { hidden: true },
          "sheet.command.add-range-protection-from-sheet-bar": { hidden: true },
          "sheet.command.delete-worksheet-protection-from-sheet-bar": {
            hidden: true,
          },
          "sheet.command.change-sheet-protection-from-sheet-bar": {
            hidden: true,
          },
          "sheet.command.view-sheet-permission-from-sheet-bar": { hidden: true },
        },
      }),
    ],
    plugins: [
      [
        UniverLicensePlugin,
        { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
      ],
      UniverCollaborationPlugin,
      [
        UniverCollaborationClientPlugin,
        {
          socketService: BrowserCollaborationSocketService,
          enableOfflineEditing: true,
          enableSingleActiveInstanceLock: false,
          snapshotServerUrl: "/universer-api/snapshot",
          collabSubmitChangesetUrl: "/universer-api/comb",
          collabWebSocketUrl: `${websocketOrigin}/universer-api/comb/connect`,
          wsSessionTicketUrl: "/universer-api/user/session-ticket",
        },
      ],
      UniverCollaborationClientUIPlugin,
      [
        UniverEditHistoryLoaderPlugin,
        {
          historyListServerUrl: "/universer-api/history",
          univerContainerId: "app",
        },
      ],
    ],
  });
  window.univerAPI = univerAPI;
  window.univer = univer;

  // alpha.6's history loader reloads the submitter after an ACK, but a peer
  // receives NEW_CHANGESETS and enters conflict while transforming the restore
  // marker. Reload that peer from the authoritative restored snapshot.
  const injector = univer.__getInjector();
  const localCache = injector.get(ILocalCacheService);
  const workbook = await univerAPI.getCollaboration().loadSheetAsync(unitID);
  if (!workbook) {
    univer.dispose();
    throw new Error(`Cannot open unit ${unitID}`);
  }

  const entity = injector.get(CollaborationController).getCollabEntity(unitID);
  let refreshingAfterRemoteRestore = false;
  entity?.session.event$.subscribe((event) => {
    if (
      refreshingAfterRemoteRestore ||
      event.eventID !== CollaborationEvent.NEW_CHANGESETS
    ) {
      return;
    }
    const changeset = (event as INewChangesetsEvent).data;
    if (
      !changeset.mutations.some(
        (mutation) => mutation.id === RevertRevisionMutation.id
      )
    ) {
      return;
    }
    refreshingAfterRemoteRestore = true;
    localCache.disableLocalCache();
    void waitForRestoredSnapshot(unitID, changeset.revision)
      .then(async (restoredRevision) => {
        await localCache.exhaustSavingTask();
        await localCache.saveOfflineData(unitID, {
          unitID,
          type: UniverInstanceType.UNIVER_SHEET,
          rev: restoredRevision,
          awaitingChangeset: null,
          mutations: [],
        });
      })
      .finally(() => location.reload());
  });

  const permissions = univer.__getInjector().get(IPermissionService);
  for (const permission of [
    new WorkbookViewHistoryPermission(unitID),
    new WorkbookRecoverHistoryPermission(unitID),
  ]) {
    if (!permissions.getPermissionPoint(permission.id)) {
      permissions.addPermissionPoint(permission);
    }
    permissions.updatePermissionPoint(permission.id, true);
  }
  onStatus("ready");
}

async function waitForRestoredSnapshot(
  unitID: string,
  confirmedRevision: number
): Promise<number> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await fetch(
      `/universer-api/snapshot/2/unit/${encodeURIComponent(unitID)}/rev/0`
    );
    if (response.ok) {
      const body = (await response.json()) as {
        readonly snapshot?: { readonly rev?: number };
        readonly changesets?: readonly unknown[];
      };
      if (
        typeof body.snapshot?.rev === "number" &&
        body.snapshot.rev >= confirmedRevision &&
        (body.changesets?.length ?? 0) === 0
      ) {
        return body.snapshot.rev;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Restored snapshot was not published in time");
}

declare global {
  interface Window {
    univerAPI?: FUniver;
    univer?: { dispose(): void };
  }
}
