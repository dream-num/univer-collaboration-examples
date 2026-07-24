import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceWorktreeCatalog } from "../server/worktrees/worktree-catalog.js";

const catalogs: WorkspaceWorktreeCatalog[] = [];
const directories: string[] = [];

afterEach(async () => {
  catalogs.splice(0).reverse().forEach((catalog) => catalog.dispose());
  for (const directory of directories.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("WorkspaceWorktreeCatalog", () => {
  it("stores scoped metadata and ordered Unit mappings", async () => {
    const catalog = await createCatalog();
    const created = catalog.create({
      worktreeID: "wt-1",
      name: "Budget review",
      creatorUserID: "alice",
      scope: { kind: "user", userID: "alice" },
      visibility: "private",
      units: [
        { unitID: "u-1", resourceID: "r-1", source: "trunk" },
      ],
      now: 10,
    });
    catalog.addUnit({
      worktreeID: "wt-1",
      unitID: "u-2",
      resourceID: "r-2",
      source: "trunk",
    });
    catalog.addUnit({
      worktreeID: "wt-1",
      unitID: "u-2",
      resourceID: "r-2",
      source: "trunk",
    });
    expect(() =>
      catalog.addUnit({
        worktreeID: "wt-1",
        unitID: "u-2",
        resourceID: "different-resource",
        source: "trunk",
      })
    ).toThrow(/different input/);

    expect(catalog.get("wt-1")).toMatchObject({
      worktreeID: created.worktreeID,
      name: created.name,
      creatorUserID: created.creatorUserID,
      scope: created.scope,
      visibility: created.visibility,
      units: [
        { unitID: "u-1", resourceID: "r-1", ordinal: 0 },
        { unitID: "u-2", resourceID: "r-2", ordinal: 1 },
      ],
    });
    expect(
      catalog.list({ actorUserID: "alice", view: "active" })
    ).toHaveLength(1);
    catalog.markProcessed("wt-1", 20);
    expect(
      catalog.list({ actorUserID: "alice", view: "active" })
    ).toHaveLength(0);
    expect(
      catalog.list({ actorUserID: "alice", view: "processed" })
    ).toHaveLength(1);
  });

  it("keeps staged resources hidden from product rows and retries by identity", async () => {
    const catalog = await createCatalog();
    catalog.create({
      worktreeID: "wt-1",
      name: "Draft",
      creatorUserID: "alice",
      scope: { kind: "user", userID: "alice" },
      visibility: "private",
      units: [],
    });
    const input = {
      resourceID: "r-new",
      worktreeID: "wt-1",
      unitID: "u-new",
      spaceID: "personal-alice",
      parentID: null,
      name: "New sheet",
      type: UniverType.UNIVER_SHEET,
      createdBy: "alice",
    };
    expect(catalog.stageResource(input)).toMatchObject({
      ...input,
      status: "staged",
    });
    expect(catalog.stageResource(input)).toMatchObject({
      ...input,
      status: "staged",
    });
    expect(() =>
      catalog.stageResource({ ...input, name: "Different" })
    ).toThrow(/different input/);
    expect(catalog.setStagedStatus("r-new", "active")).toMatchObject({
      status: "active",
    });
  });

  it("lists every Worktree in a view for internal reconciliation", async () => {
    const catalog = await createCatalog();
    catalog.create({
      worktreeID: "wt-user-private",
      name: "Private user draft",
      creatorUserID: "alice",
      scope: { kind: "user", userID: "alice" },
      visibility: "private",
      units: [],
      now: 1,
    });
    catalog.create({
      worktreeID: "wt-space-private",
      name: "Private space draft",
      creatorUserID: "bob",
      scope: { kind: "space", spaceID: "team-1" },
      visibility: "private",
      units: [],
      now: 2,
    });
    catalog.create({
      worktreeID: "wt-processed",
      name: "Processed",
      creatorUserID: "alice",
      scope: { kind: "user", userID: "alice" },
      visibility: "private",
      units: [],
      now: 3,
    });
    catalog.markProcessed("wt-processed", 4);

    expect(
      catalog.listAll("active").map(({ worktreeID }) => worktreeID)
    ).toEqual(["wt-space-private", "wt-user-private"]);
    expect(
      catalog.listAll("processed").map(({ worktreeID }) => worktreeID)
    ).toEqual(["wt-processed"]);
  });

  it("journals pending cross-store operations idempotently", async () => {
    const catalog = await createCatalog();
    const operation = {
      operationID: "create-worktree:wt-1",
      kind: "create-worktree" as const,
      actorUserID: "alice",
      worktree: {
        worktreeID: "wt-1",
        name: "Agent draft",
        creatorUserID: "alice",
        scope: { kind: "user" as const, userID: "alice" },
        visibility: "private" as const,
        units: [],
      },
    };

    expect(catalog.beginOperation(operation)).toMatchObject(operation);
    expect(catalog.beginOperation(operation)).toMatchObject(operation);
    expect(catalog.listPendingOperations()).toEqual([
      expect.objectContaining(operation),
    ]);
    expect(() =>
      catalog.beginOperation({
        ...operation,
        worktree: { ...operation.worktree, name: "Different input" },
      })
    ).toThrow(/different input/);

    catalog.completeOperation(operation.operationID);
    expect(catalog.listPendingOperations()).toEqual([]);
  });
});

async function createCatalog(): Promise<WorkspaceWorktreeCatalog> {
  const directory = await mkdtemp(join(tmpdir(), "workspace-catalog-"));
  directories.push(directory);
  const catalog = new WorkspaceWorktreeCatalog(
    join(directory, "workspace.sqlite")
  );
  catalogs.push(catalog);
  return catalog;
}
