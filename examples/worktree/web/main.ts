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
const client = new WorktreeClient({ origin: location.origin });

type WorktreeStatus = Awaited<ReturnType<WorktreeClient["getWorktree"]>>["status"];

function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing ${selector} in index.html`);
  return found;
}
const ui = {
  status: element<HTMLElement>("#status"),
  steps: [...element<HTMLElement>("#lifecycle").querySelectorAll<HTMLElement>("li")],
  viewTrunk: element<HTMLAnchorElement>("#view-trunk"),
  viewDraft: element<HTMLAnchorElement>("#view-draft"),
  ready: element<HTMLButtonElement>("#ready"),
  reopen: element<HTMLButtonElement>("#reopen"),
  merge: element<HTMLButtonElement>("#merge"),
  discard: element<HTMLButtonElement>("#discard"),
};
const buttons = [ui.ready, ui.reopen, ui.merge, ui.discard];

const editorURL = (draft: boolean) =>
  `/?unit=${unitID}${draft ? `&worktree=${worktreeID}` : ""}`;

// Lifecycle: draft → ready → merged, with Reopen taking ready back to draft for another round and
// Discard abandoning a draft or ready Worktree. ready freezes the draft; merged and discarded are
// final and close the draft for good. See README.md for the agent-edits, human-reviews workflow.
const draftOpen = (current: WorktreeStatus) => current === "draft" || current === "ready";

function nextStep(current: WorktreeStatus, editingDraft: boolean): string {
  switch (current) {
    case "draft":
      return editingDraft
        ? "You are editing the draft; trunk does not see these changes. Next: change a few cells, then click Mark ready."
        : "You are viewing trunk. Next: open Draft to see the agent's isolated changes.";
    case "ready":
      return "The draft is frozen for review; edits are rejected. Next: compare Trunk and Draft, then Merge, Reopen, or Discard.";
    case "merging":
      return "Merging the draft into trunk. Reload in a moment.";
    case "merged":
      return `Merged: trunk now contains the draft's changes, and this Worktree is finished. To start over, stop the server, run \`${RESET_COMMAND}\`, and start it again.`;
    case "discarded":
      return `Discarded: trunk is unchanged, and this Worktree is finished. To start over, stop the server, run \`${RESET_COMMAND}\`, and start it again.`;
  }
}

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const code = (error as { code?: unknown }).code;
  return code === undefined ? error.message : `${String(code)}: ${error.message}`;
}

// Highlight the lifecycle step, mark the active view, and enable only the allowed actions.
function render(current: WorktreeStatus, editingDraft: boolean) {
  const order = ["draft", "ready", "merged"];
  const position = current === "merging" ? 2 : order.indexOf(current);
  for (const [index, step] of ui.steps.entries()) {
    step.classList.toggle("is-done", position > index);
    step.classList.toggle("is-current", position === index);
    step.classList.toggle("is-discarded", current === "discarded" && index === 2);
  }
  if (current === "discarded") {
    ui.steps[2]!.querySelector(".step-name")!.textContent = "Discarded";
    ui.steps[2]!.querySelector("small")!.textContent = "trunk unchanged";
  }
  ui.viewTrunk.toggleAttribute("aria-current", !editingDraft);
  ui.viewDraft.toggleAttribute("aria-current", editingDraft);
  ui.viewDraft.hidden = !draftOpen(current);
  ui.ready.disabled = current !== "draft";
  ui.reopen.disabled = current !== "ready";
  ui.merge.disabled = current !== "ready";
  ui.discard.disabled = !draftOpen(current);
  ui.status.classList.remove("is-error");
  ui.status.textContent = nextStep(current, editingDraft);
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
  render(worktree.status, editingDraft);

  // Run a lifecycle action; on failure show the server's answer and re-read the status.
  const run = (action: () => Promise<unknown>, next: () => void) => async () => {
    for (const button of buttons) button.disabled = true;
    try {
      await action();
      next();
    } catch (error) {
      worktree = await client.getWorktree(worktreeID).catch(() => worktree);
      render(worktree.status, editingDraft);
      ui.status.classList.add("is-error");
      ui.status.textContent = describeError(error);
    }
  };
  ui.ready.onclick = run(() => client.markReady(worktreeID), () => location.reload());
  ui.reopen.onclick = run(
    () => client.reopenWorktree(worktreeID),
    () => location.assign(editorURL(true)),
  );
  ui.merge.onclick = run(
    () => client.mergeWorktree(worktreeID),
    () => location.assign(editorURL(false)),
  );
  ui.discard.onclick = run(
    () => client.discardWorktree(worktreeID),
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
  ui.status.classList.add("is-error");
  ui.status.textContent = describeError(error);
});
