import { LocaleType, LogLevel } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import {
  WorktreeClient,
  createWorktreeCollaborationConfig,
} from "@univerjs-pro/collaboration-worktree-client";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

const worktreeID = "demo-worktree";
const unitID = "worktree-sheet";
const client = new WorktreeClient({ origin: location.origin });
const worktree = await client.getWorktree(worktreeID);
const editingDraft = new URL(location.href).searchParams.has("worktree");
const editorURL = (draft: boolean) =>
  `/?unit=${unitID}&type=2${draft ? `&worktree=${worktreeID}` : ""}`;
document.querySelector<HTMLElement>("#toolbar")!.innerHTML =
  `<a href="${editorURL(false)}">Trunk</a><a href="${editorURL(true)}">Draft</a><span>Status: ${worktree.status}</span><button id="ready">Ready</button><button id="reopen">Reopen</button><button id="merge">Merge</button>`;
document.querySelector<HTMLElement>("#status")!.textContent = editingDraft
  ? "Editing the isolated draft."
  : "Viewing trunk.";
document.querySelector<HTMLButtonElement>("#ready")!.onclick = async () => {
  await client.markReady(worktreeID);
  location.reload();
};
document.querySelector<HTMLButtonElement>("#reopen")!.onclick = async () => {
  await client.reopenWorktree(worktreeID);
  location.href = editorURL(true);
};
document.querySelector<HTMLButtonElement>("#merge")!.onclick = async () => {
  await client.mergeWorktree(worktreeID);
  location.href = editorURL(false);
};

const baseURL = `${location.protocol}//${location.host}/universer-api`;
const collaboration = editingDraft
  ? createWorktreeCollaborationConfig({ origin: location.origin, worktreeID })
  : {
      snapshotServerUrl: `${baseURL}/snapshot`,
      collabSubmitChangesetUrl: `${baseURL}/comb`,
      collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
      wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
    };
createUniver({
  locale: LocaleType.EN_US,
  locales: {
    [LocaleType.EN_US]: mergeLocales(
      UniverPresetSheetsCoreEnUS,
      CollaborationClientEnUS,
      CollaborationClientUIEnUS,
    ),
  },
  theme: defaultTheme,
  logLevel: LogLevel.WARN,
  collaboration: true,
  presets: [UniverSheetsCorePreset({ container: "app" })],
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
        authzUrl: `${baseURL}/authz`,
        ...collaboration,
        sendChangesetTimeout: 200,
      },
    ],
    UniverCollaborationClientUIPlugin,
  ],
});
