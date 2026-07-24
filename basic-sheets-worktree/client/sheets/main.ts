import type { IGetUserResponse } from "@univerjs/protocol";
import {
  LocaleType,
  LogLevel,
  Univer,
  UniverInstanceType,
  UserManagerService,
} from "@univerjs/core";
import { FUniver } from "@univerjs/core/facade";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import {
  WorktreeClient,
  WorktreeEventClient,
} from "@univerjs/collaboration-worktree-client";
import type { WorktreeData } from "@univerjs/collaboration-worktree-service";
import { HTTPService } from "@univerjs/network";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import {
  createUniver,
  defaultTheme,
  mergeLocales,
} from "@univerjs/presets";
import { origin, unitID, url, worktreeID } from "./consts";
import { getCollaborationPlugins } from "./plugins";

import "@univerjs/preset-sheets-core/lib/index.css";
import "../global.css";

const client = new WorktreeClient({ origin });

if (worktreeID && unitID) {
  startEditor(worktreeID, unitID);
} else {
  void createDraft().catch(showFatalError);
}

async function createDraft(): Promise<void> {
  const nextWorktreeID = crypto.randomUUID();
  const nextUnitID = crypto.randomUUID();
  await client.createWorktree({ worktreeID: nextWorktreeID });
  await client.createUnitFromData(nextWorktreeID, {
    type: UniverInstanceType.UNIVER_SHEET,
    data: createEmptyWorkbookData(nextUnitID),
  });
  url.searchParams.set("worktree", nextWorktreeID);
  url.searchParams.set("unit", nextUnitID);
  url.searchParams.set("type", String(UniverInstanceType.UNIVER_SHEET));
  window.location.replace(url);
}

function startEditor(activeWorktreeID: string, activeUnitID: string): void {
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
    logLevel: LogLevel.VERBOSE,
    collaboration: true,
    presets: [
      UniverSheetsCorePreset({
        container: "app",
      }),
    ],
    plugins: [
      [
        UniverLicensePlugin,
        { license: import.meta.env.VITE_UNIVER_LICENSE || undefined },
      ],
      ...getCollaborationPlugins(activeWorktreeID),
    ],
  });

  window.univer = univer;
  window.univerAPI = univerAPI;
  void fetchServerUser(univer);
  wireWorktreeToolbar(activeWorktreeID, activeUnitID);
}

function wireWorktreeToolbar(
  activeWorktreeID: string,
  activeUnitID: string
): void {
  text("worktree-identity", `${activeWorktreeID} / ${activeUnitID}`);
  const events = new WorktreeEventClient({
    origin,
    worktreeID: activeWorktreeID,
  });
  events.onChange(renderWorktree);
  void events.connect().catch(showFatalError);

  action("worktree-ready", () => client.markReady(activeWorktreeID));
  action("worktree-reopen", () => client.reopenWorktree(activeWorktreeID));
  action("worktree-merge", () => client.mergeWorktree(activeWorktreeID));
  action("worktree-discard", () => client.discardWorktree(activeWorktreeID));
  window.addEventListener("beforeunload", () => events.dispose(), {
    once: true,
  });
}

function renderWorktree(worktree: WorktreeData): void {
  text("worktree-status", worktree.status);
  const unit = worktree.units.find(({ unitID }) => unitID === windowUnitID());
  const result = unit?.mergeResult;
  text(
    "worktree-message",
    result
      ? `merge: ${result.status}${
          "trunkRevision" in result ? ` @ rev ${result.trunkRevision}` : ""
        }`
      : `draft revision ${unit?.draftHeadRevision ?? "?"}`
  );
  button("worktree-ready").disabled = worktree.status !== "draft";
  button("worktree-reopen").disabled = worktree.status !== "ready";
  button("worktree-merge").disabled = worktree.status !== "ready";
  button("worktree-discard").disabled =
    worktree.status !== "draft" && worktree.status !== "ready";
}

function action(
  id: string,
  operation: () => Promise<WorktreeData>
): void {
  button(id).addEventListener("click", () => {
    text("worktree-message", "working…");
    void operation().then(renderWorktree).catch(showFatalError);
  });
}

async function fetchServerUser(univer: Univer): Promise<void> {
  const injector = univer.__getInjector();
  const userService = injector.get(UserManagerService);
  const httpService = injector.get(HTTPService);
  const response = await httpService.get<IGetUserResponse>(
    `${origin}/universer-api/user`
  );
  if (response.body.user) userService.setCurrentUser(response.body.user);
}

function createEmptyWorkbookData(unitID: string) {
  return {
    id: unitID,
    rev: 1,
    name: "Worktree Sheet",
    appVersion: "",
    locale: LocaleType.EN_US,
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet 1",
        rowCount: 100,
        columnCount: 26,
        cellData: { 0: { 0: { v: "Edit this Worktree draft" } } },
      },
    },
    styles: {},
    resources: [],
  };
}

function showFatalError(error: unknown): void {
  console.error(error);
  text(
    "worktree-message",
    error instanceof Error ? error.message : "Unexpected error"
  );
}

function text(id: string, value: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function button(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Missing button ${id}`);
  }
  return element;
}

function windowUnitID(): string {
  return new URL(window.location.href).searchParams.get("unit") ?? "";
}

declare global {
  interface Window {
    univer?: Univer;
    univerAPI?: FUniver;
  }
}
