import { IPermissionService } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import "@univerjs-pro/collaboration-client/facade";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  type FUniver,
  LocaleType,
  mergeLocales,
} from "@univerjs/presets";
import { WorkbookEditablePermission } from "@univerjs/sheets";
import type { DocumentRole } from "./auth";

import "@univerjs/preset-sheets-core/lib/index.css";

export interface CollaborationView {
  dispose(): void;
}

export async function openCollaborativeSheet(
  unitID: string,
  role: DocumentRole,
  callbacks: {
    readonly members: (names: readonly string[]) => void;
    readonly status: (status: string) => void;
  }
): Promise<CollaborationView> {
  const websocketOrigin = location.origin.replace(/^http/, "ws");
  const { univer, univerAPI } = createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        CollaborationClientEnUS,
        CollaborationClientUIEnUS
      ),
    },
    theme: defaultTheme,
    collaboration: true,
    presets: [UniverSheetsCorePreset({ container: "univer-container" })],
    // createUniver registers this list before lifecycle startup. Registering
    // these plugins after createUniver would leave their startup dependencies
    // unavailable while loadSheetAsync is running.
    plugins: [
      UniverCollaborationPlugin,
      [
        UniverCollaborationClientPlugin,
        {
          socketService: BrowserCollaborationSocketService,
          enableOfflineEditing: false,
          enableSingleActiveInstanceLock: false,
          snapshotServerUrl: "/universer-api/snapshot",
          collabSubmitChangesetUrl: "/universer-api/comb",
          collabWebSocketUrl: `${websocketOrigin}/universer-api/comb/connect`,
          wsSessionTicketUrl: "/universer-api/user/session-ticket",
        },
      ],
      UniverCollaborationClientUIPlugin,
    ],
  });
  // Convenient for the demo's browser console and end-to-end verification.
  window.univerAPI = univerAPI;

  try {
    const workbook = await univerAPI.getCollaboration().loadSheetAsync(unitID);
    if (!workbook) throw new Error(`Cannot open unit ${unitID}`);

    if (role === "viewer") {
      // UI read-only is feedback. Service middleware remains the security boundary.
      const permissions = univer.__getInjector().get(IPermissionService);
      const editable = new WorkbookEditablePermission(unitID);
      if (!permissions.getPermissionPoint(editable.id)) {
        permissions.addPermissionPoint(editable);
      }
      permissions.updatePermissionPoint(editable.id, false);
    }

    const memberSubscription = univerAPI
      .getCollaboration()
      .subscribeCollaborators(unitID, (members) => {
        callbacks.members(members.map((member) => member.name || member.userID));
      });
    const timer = window.setInterval(() => {
      const value = univerAPI.getCollaboration().getCollaborationStatus(unitID);
      callbacks.status(String(value));
    }, 500);

    return {
      dispose: () => {
        window.clearInterval(timer);
        memberSubscription.dispose();
        univer.dispose();
        if (window.univerAPI === univerAPI) delete window.univerAPI;
      },
    };
  } catch (error) {
    univer.dispose();
    if (window.univerAPI === univerAPI) delete window.univerAPI;
    throw error;
  }
}

declare global {
  interface Window {
    univerAPI?: FUniver;
  }
}
