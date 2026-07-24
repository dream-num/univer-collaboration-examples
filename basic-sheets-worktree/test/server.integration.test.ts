import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  WorktreeClient,
  WorktreeEventClient,
} from "@univerjs/collaboration-worktree-client/management";
import type { IWorkbookData } from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBasicSheetsWorktreeApplication,
  type BasicSheetsWorktreeApplication,
} from "../server/application.js";

const applications: BasicSheetsWorktreeApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.allSettled(applications.splice(0).map((app) => app.close()));
  await Promise.allSettled(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("basic-sheets-worktree integration", () => {
  it("creates, observes, loads, merges and persists a local Worktree Sheet", async () => {
    const directory = await mkdtemp(join(tmpdir(), "univer-worktree-demo-"));
    directories.push(directory);
    const filename = join(directory, "demo.sqlite");
    let running = await start(filename);
    const worktreeID = "demo-worktree";
    const unitID = "demo-unit";
    const client = new WorktreeClient({ origin: running.origin });

    await client.createWorktree({ worktreeID });
    const events = new WorktreeEventClient({
      origin: running.origin,
      worktreeID,
      reconnectDelayMs: 10,
    });
    await expect(events.connect()).resolves.toMatchObject({
      worktreeID,
      status: "draft",
    });
    const changed = new Promise<void>((resolve) => {
      const subscription = events.onChange((worktree) => {
        if (worktree.units.some((unit) => unit.unitID === unitID)) {
          subscription.dispose();
          resolve();
        }
      });
    });
    await client.createUnitFromData(worktreeID, {
      type: UniverType.UNIVER_SHEET,
      data: workbook(unitID),
    });
    await changed;

    const draftSnapshot = await fetch(
      `${running.origin}/universer-api/worktrees/${worktreeID}/snapshot/2/unit/${unitID}/rev/0`
    );
    expect(draftSnapshot.status).toBe(200);
    expect(await draftSnapshot.json()).toMatchObject({
      snapshot: { unitID, rev: 1, type: UniverType.UNIVER_SHEET },
    });
    await client.markReady(worktreeID);
    await client.mergeWorktree(worktreeID);
    await vi.waitFor(() =>
      expect(events.current).toMatchObject({ status: "merged" })
    );
    expect(events.current?.units[0]?.mergeResult).toMatchObject({
      status: "merged",
      trunkRevision: 1,
    });
    events.dispose();

    const trunkSnapshot = await fetch(
      `${running.origin}/universer-api/snapshot/2/unit/${unitID}/rev/0`
    );
    expect(trunkSnapshot.status).toBe(200);
    const trunkSnapshotBody = (await trunkSnapshot.json()) as any;
    expect(trunkSnapshotBody).toMatchObject({
      snapshot: { unitID, rev: 1 },
    });
    expect(trunkSnapshotBody.snapshot.workbook.rev).toBe(1);

    await running.app.close();
    applications.splice(applications.indexOf(running.app), 1);
    running = await start(filename);
    const restored = new WorktreeClient({ origin: running.origin });
    await expect(restored.getWorktree(worktreeID)).resolves.toMatchObject({
      status: "merged",
      units: [{ unitID, source: "worktree" }],
    });
  }, 30_000);
});

async function start(filename: string): Promise<{
  readonly app: BasicSheetsWorktreeApplication;
  readonly origin: string;
}> {
  const app = await createBasicSheetsWorktreeApplication({
    databaseFilename: filename,
    serveClient: false,
  });
  applications.push(app);
  const port = await app.listen(0);
  return { app, origin: `http://127.0.0.1:${port}` };
}

function workbook(unitID: string): IWorkbookData {
  return {
    id: unitID,
    rev: 1,
    name: "Worktree Demo",
    appVersion: "",
    locale: "enUS" as IWorkbookData["locale"],
    sheetOrder: ["sheet-1"],
    sheets: {
      "sheet-1": {
        id: "sheet-1",
        name: "Sheet 1",
        rowCount: 20,
        columnCount: 10,
        cellData: { 0: { 0: { v: "Worktree" } } },
      },
    },
    styles: {},
    resources: [],
  };
}
