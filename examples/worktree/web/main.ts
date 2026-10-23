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
import "@univerjs-pro/collaboration-client/facade";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

const worktreeID = "demo-worktree";
const unitID = "worktree-sheet";
const RESET_COMMAND = "pnpm --filter @univerjs/collaboration-example-worktree reset";
const toolbar = document.querySelector<HTMLElement>("#toolbar")!;
const status = document.querySelector<HTMLElement>("#status")!;
const client = new WorktreeClient({ origin: location.origin });

type WorktreeStatus = Awaited<ReturnType<WorktreeClient["getWorktree"]>>["status"];

const editorURL = (draft: boolean) =>
  `/?unit=${unitID}${draft ? `&worktree=${worktreeID}` : ""}`;

// Lifecycle: Ready takes draft to ready, Reopen takes ready back to draft, and Merge takes ready to
// merged. ready freezes the draft; merged and discarded are final and close the draft for good.
const draftOpen = (current: WorktreeStatus) => current === "draft" || current === "ready";

function describeStatus(current: WorktreeStatus, editingDraft: boolean): string {
  switch (current) {
    case "draft":
      return editingDraft ? "Editing the isolated draft." : "Viewing trunk. Open Draft to edit in isolation.";
    case "ready":
      return "Draft is ready and frozen. Merge it into trunk, or Reopen it to keep editing.";
    case "merging":
      return "Merge in progress. Reload in a moment.";
    case "merged":
      return `Draft was merged into trunk. To start over, stop the server, run \`${RESET_COMMAND}\`, and start it again.`;
    case "discarded":
      return `Draft was discarded. To start over, stop the server, run \`${RESET_COMMAND}\`, and start it again.`;
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  return code === undefined ? error.message : `${String(code)}: ${error.message}`;
}

async function main() {
  const requested = new URL(location.href).searchParams.get("worktree");
  if (requested !== null && requested !== worktreeID) {
    throw new Error(`This example serves only the fixed Worktree "${worktreeID}".`);
  }
  let worktree = await client.getWorktree(worktreeID);
  const editingDraft = requested !== null && draftOpen(worktree.status);
  if (requested !== null && !editingDraft) {
    // The draft collaboration path rejects a merged or discarded Worktree; show trunk instead.
    history.replaceState(null, "", editorURL(false));
  }

  toolbar.innerHTML =
    `<a href="${editorURL(false)}">Trunk</a><a id="draft-link" href="${editorURL(true)}">Draft</a>` +
    `<span id="worktree-status"></span>` +
    `<button id="ready">Ready</button><button id="reopen">Reopen</button><button id="merge">Merge</button>`;
  const draftLink = toolbar.querySelector<HTMLAnchorElement>("#draft-link")!;
  const statusLabel = toolbar.querySelector<HTMLElement>("#worktree-status")!;
  const buttons = {
    ready: toolbar.querySelector<HTMLButtonElement>("#ready")!,
    reopen: toolbar.querySelector<HTMLButtonElement>("#reopen")!,
    merge: toolbar.querySelector<HTMLButtonElement>("#merge")!,
  };
  // Enable only the action the current status allows.
  const render = () => {
    statusLabel.textContent = `Status: ${worktree.status}`;
    draftLink.hidden = !draftOpen(worktree.status);
    buttons.ready.disabled = worktree.status !== "draft";
    buttons.reopen.disabled = worktree.status !== "ready";
    buttons.merge.disabled = worktree.status !== "ready";
    status.textContent = describeStatus(worktree.status, editingDraft);
  };
  render();

  // Run a lifecycle action; on failure show the server's answer and re-read the status.
  const run = (action: () => Promise<unknown>, next: () => void) => async () => {
    for (const button of Object.values(buttons)) button.disabled = true;
    try {
      await action();
      next();
    } catch (error) {
      worktree = await client.getWorktree(worktreeID).catch(() => worktree);
      render();
      status.textContent = describeError(error);
    }
  };
  buttons.ready.onclick = run(() => client.markReady(worktreeID), () => location.reload());
  buttons.reopen.onclick = run(
    () => client.reopenWorktree(worktreeID),
    () => location.assign(editorURL(true)),
  );
  buttons.merge.onclick = run(
    () => client.mergeWorktree(worktreeID),
    () => location.assign(editorURL(false)),
  );

  const baseURL = `${location.protocol}//${location.host}/universer-api`;
  const collaboration = editingDraft
    ? createWorktreeCollaborationConfig({ origin: location.origin, worktreeID })
    : {
        snapshotServerUrl: `${baseURL}/snapshot`,
        collabSubmitChangesetUrl: `${baseURL}/comb`,
        collabWebSocketUrl: `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/universer-api/comb/connect`,
        wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
      };
  const { univerAPI } = createUniver({
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
        { license: import.meta.env.UNIVER_LICENSE || undefined },
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

  const workbook = await univerAPI.getCollaboration().loadSheetAsync(unitID);
  if (!workbook) throw new Error("Document could not be loaded");
}

void main().catch((error: unknown) => {
  console.error(error);
  status.textContent = describeError(error);
});
