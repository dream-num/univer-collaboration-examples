import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverType } from "@univerjs/protocol";
import type { IDocumentData } from "@univerjs/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceApplication,
  type WorkspaceApplication,
} from "../server/application.js";
import { createInitialUnit } from "../server/unit-data.js";
import { orchestrationCustomData } from "../server/worktrees/orchestration.js";

const applications: WorkspaceApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const application of applications.splice(0).reverse()) {
    await application.close();
  }
  for (const directory of directories.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Workspace Worktree reconciliation", () => {
  it("resumes a pending initial-data create when the same request is retried", async () => {
    const { application } = await createApplication();
    const actorUserID = "user-alice";
    const worktreeID = "retry-pending-initial-doc";
    const unitID = "retry-pending-initial-doc-unit";
    const personal = application.productStore.ensurePersonalSpace(actorUserID, "Alice");
    await application.worktreeApplication.create(actorUserID, {
      worktreeID,
      name: "Retry pending initial Doc",
      scope: { kind: "user" },
    });
    const initial = createInitialUnit(UniverType.UNIVER_DOC, unitID, "Retry title");
    const input = {
      resourceID: "retry-pending-initial-doc-resource",
      unitID,
      spaceID: personal.id,
      name: "Retry metadata",
      type: UniverType.UNIVER_DOC,
      initialData: initial.data as IDocumentData,
    };
    const addUnit = vi
      .spyOn(application.worktreeCatalog, "addUnit")
      .mockImplementationOnce(() => {
        throw new Error("simulated unknown result after draft create");
      });

    await expect(
      application.worktreeApplication.createUnit(actorUserID, worktreeID, input)
    ).rejects.toThrow("simulated unknown result after draft create");
    addUnit.mockRestore();

    await expect(
      application.worktreeApplication.createUnit(actorUserID, worktreeID, input)
    ).resolves.toMatchObject({
      worktreeID,
      units: [expect.objectContaining({ unitID, resourceID: input.resourceID })],
    });
    expect(application.worktreeCatalog.listPendingOperations()).toEqual([]);
  });

  it.each([
    ["a mismatched ID", { id: "other-unit" }],
    ["a non-initial revision", { rev: 2 }],
  ])("rejects %s before journaling a direct application call", async (label, override) => {
    const { application } = await createApplication();
    const actorUserID = "user-alice";
    const worktreeID = `invalid-initial-${label.replaceAll(" ", "-")}`;
    const unitID = `${worktreeID}-unit`;
    const personal = application.productStore.ensurePersonalSpace(actorUserID, "Alice");
    await application.worktreeApplication.create(actorUserID, {
      worktreeID,
      name: "Invalid initial data",
      scope: { kind: "user" },
    });
    const initial = createInitialUnit(UniverType.UNIVER_DOC, unitID, "Invalid title");
    const beginOperation = vi.spyOn(application.worktreeCatalog, "beginOperation");

    await expect(
      application.worktreeApplication.createUnit(actorUserID, worktreeID, {
        resourceID: `${worktreeID}-resource`,
        unitID,
        spaceID: personal.id,
        name: "Invalid metadata",
        type: UniverType.UNIVER_DOC,
        initialData: { ...(initial.data as IDocumentData), ...override },
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(beginOperation).not.toHaveBeenCalled();
    expect(application.worktreeCatalog.listPendingOperations()).toEqual([]);
  });

  it("treats object key order as irrelevant to completed initial-data retries", async () => {
    const { application } = await createApplication();
    const actorUserID = "user-alice";
    const worktreeID = "canonical-initial-doc";
    const unitID = "canonical-initial-doc-unit";
    const personal = application.productStore.ensurePersonalSpace(actorUserID, "Alice");
    await application.worktreeApplication.create(actorUserID, {
      worktreeID,
      name: "Canonical initial Doc",
      scope: { kind: "user" },
    });
    const initial = createInitialUnit(UniverType.UNIVER_DOC, unitID, "Canonical title");
    const baseInput = {
      resourceID: "canonical-initial-doc-resource",
      unitID,
      spaceID: personal.id,
      name: "Canonical metadata",
      type: UniverType.UNIVER_DOC,
    };
    const firstData = {
      ...(initial.data as IDocumentData),
      fingerprintProbe: { "é": 1, "e\u0301": 2 },
    } as IDocumentData;
    const reorderedData = {
      ...(initial.data as IDocumentData),
      fingerprintProbe: { "e\u0301": 2, "é": 1 },
    } as IDocumentData;

    await application.worktreeApplication.createUnit(actorUserID, worktreeID, {
      ...baseInput,
      initialData: firstData,
    });
    await expect(
      application.worktreeApplication.createUnit(actorUserID, worktreeID, {
        ...baseInput,
        initialData: reorderedData,
      })
    ).resolves.toMatchObject({ worktreeID });
  });

  it("recovers the exact initial Doc data after draft creation succeeds", async () => {
    const { application, databaseFilename } = await createApplication();
    const actorUserID = "user-alice";
    const worktreeID = "recover-initial-doc";
    const unitID = "recover-initial-doc-unit";
    const personal = application.productStore.ensurePersonalSpace(
      actorUserID,
      "Alice"
    );
    await application.worktreeApplication.create(actorUserID, {
      worktreeID,
      name: "Recover initial Doc",
      scope: { kind: "user" },
    });
    const initial = createInitialUnit(
      UniverType.UNIVER_DOC,
      unitID,
      "Recovered Typst title"
    );
    const initialData = {
      ...(initial.data as IDocumentData),
      documentStyle: {
        ...(initial.data as IDocumentData).documentStyle,
        marginLeft: 149,
      },
    };
    const addUnit = vi
      .spyOn(application.worktreeCatalog, "addUnit")
      .mockImplementationOnce(() => {
        throw new Error("simulated stop after draft create");
      });

    await expect(
      application.worktreeApplication.createUnit(actorUserID, worktreeID, {
        resourceID: "recover-initial-doc-resource",
        unitID,
        spaceID: personal.id,
        name: "Recovered metadata",
        type: UniverType.UNIVER_DOC,
        initialData,
      })
    ).rejects.toThrow("simulated stop after draft create");
    addUnit.mockRestore();
    expect(application.worktreeCatalog.listPendingOperations()).toHaveLength(1);

    await application.close();
    applications.splice(applications.indexOf(application), 1);
    const recovered = await openApplication(databaseFilename);
    const unit = await recovered.worktreeService.getUnit(
      { worktreeID, unitID, type: UniverType.UNIVER_DOC, revision: 0 },
      {
        userID: actorUserID,
        customData: Object.create(null) as Record<string, unknown>,
      }
    );
    const documentData = JSON.parse(
      new TextDecoder().decode(unit.snapshot.doc!.originalMeta)
    ) as IDocumentData;

    expect(recovered.worktreeCatalog.listPendingOperations()).toEqual([]);
    expect(unit.snapshot).toMatchObject({
      unitID,
      doc: { name: "Recovered Typst title" },
    });
    expect(documentData.documentStyle?.marginLeft).toBe(149);
  });

  it("recovers a Team Worktree after the creator loses Space access", async () => {
    const { application, databaseFilename } = await createApplication();
    const team = application.productStore.createTeam({
      id: "team-reconcile-revoked",
      name: "Reconcile revoked",
      ownerUserId: "user-bob",
    });
    application.productStore.setSpaceMember({
      spaceID: team.id,
      userId: "user-alice",
      role: "editor",
      invitedBy: "user-bob",
    });
    await application.worktreeApplication.create("user-alice", {
      worktreeID: "reconcile-revoked",
      name: "Reconcile revoked",
      scope: { kind: "space", spaceID: team.id },
      visibility: "space",
    });
    await application.worktreeApplication.createUnit(
      "user-alice",
      "reconcile-revoked",
      {
        resourceID: "reconcile-revoked-resource",
        unitID: "reconcile-revoked-unit",
        spaceID: team.id,
        name: "Reconcile revoked Unit",
        type: UniverType.UNIVER_DOC,
      }
    );
    await application.worktreeApplication.ready(
      "user-alice",
      "reconcile-revoked"
    );
    await application.worktreeService.mergeWorktree(
      { worktreeID: "reconcile-revoked" },
      {
        memberID: "reconcile-bob",
        userID: "user-bob",
        customData: orchestrationCustomData() as Record<string, unknown>,
      }
    );
    application.productStore.removeSpaceMember(team.id, "user-alice");

    await application.close();
    applications.splice(applications.indexOf(application), 1);
    const recovered = await openApplication(databaseFilename);

    expect(
      recovered.worktreeCatalog.getStagedResource(
        "reconcile-revoked-resource"
      )
    ).toMatchObject({ status: "active" });
  });

  it("recovers product activation and discard after the SDK transition commits", async () => {
    const { application, databaseFilename } = await createApplication();
    const actorUserID = "user-alice";
    const personal = application.productStore.ensurePersonalSpace(
      actorUserID,
      "Alice"
    );
    const callOptions = {
      memberID: "reconcile-effects-alice",
      userID: actorUserID,
      customData: orchestrationCustomData() as Record<string, unknown>,
    };

    for (const worktreeID of ["recover-merge-effects", "recover-discard-effects"]) {
      await application.worktreeApplication.create(actorUserID, {
        worktreeID,
        name: worktreeID,
        scope: { kind: "user" },
      });
      await application.worktreeApplication.createUnit(actorUserID, worktreeID, {
        resourceID: `${worktreeID}-resource`,
        unitID: `${worktreeID}-unit`,
        spaceID: personal.id,
        name: `${worktreeID} unit`,
        type: UniverType.UNIVER_SHEET,
      });
    }
    await application.worktreeApplication.ready(
      actorUserID,
      "recover-merge-effects"
    );
    await application.worktreeService.mergeWorktree(
      { worktreeID: "recover-merge-effects" },
      callOptions
    );
    await application.worktreeService.discardWorktree(
      { worktreeID: "recover-discard-effects" },
      callOptions
    );

    await application.close();
    applications.splice(applications.indexOf(application), 1);
    const recovered = await openApplication(databaseFilename);

    await expect(
      recovered.worktreeApplication.get(actorUserID, "recover-merge-effects")
    ).resolves.toMatchObject({
      status: "merged",
      units: [{ resourceStatus: "active" }],
    });
    await expect(
      recovered.worktreeApplication.get(actorUserID, "recover-discard-effects")
    ).resolves.toMatchObject({
      status: "discarded",
      units: [{ resourceStatus: "discarded" }],
    });
  });

  it("does not retain a terminal create-Unit failure in the startup journal", async () => {
    const { application, databaseFilename } = await createApplication();
    const actorUserID = "user-alice";
    const personal = application.productStore.ensurePersonalSpace(
      actorUserID,
      "Alice"
    );
    await application.worktreeApplication.create(actorUserID, {
      worktreeID: "terminal-create-unit",
      name: "Terminal create Unit",
      scope: { kind: "user" },
    });
    await application.worktreeApplication.ready(
      actorUserID,
      "terminal-create-unit"
    );

    await expect(
      application.worktreeApplication.createUnit(
        actorUserID,
        "terminal-create-unit",
        {
          resourceID: "terminal-resource",
          unitID: "terminal-unit",
          spaceID: personal.id,
          name: "Cannot be created",
          type: UniverType.UNIVER_DOC,
        }
      )
    ).rejects.toBeDefined();
    expect(application.worktreeCatalog.listPendingOperations()).toEqual([]);

    await application.close();
    applications.splice(applications.indexOf(application), 1);

    const recovered = await openApplication(databaseFilename);
    await expect(
      recovered.worktreeApplication.get(
        actorUserID,
        "terminal-create-unit"
      )
    ).resolves.toMatchObject({
      worktreeID: "terminal-create-unit",
      status: "ready",
      units: [],
    });
  });

  it("finishes journaled create, add, and create-local operations", async () => {
    const { application, databaseFilename } = await createApplication();
    const actorUserID = "user-alice";
    const options = {
      memberID: "reconcile-user-alice",
      userID: actorUserID,
      customData: orchestrationCustomData() as Record<string, unknown>,
    };

    application.worktreeCatalog.beginOperation({
      operationID: "create-worktree:recover-create",
      kind: "create-worktree",
      actorUserID,
      worktree: {
        worktreeID: "recover-create",
        name: "Recovered create",
        creatorUserID: actorUserID,
        scope: { kind: "user", userID: actorUserID },
        visibility: "private",
        units: [],
      },
    });
    await application.worktreeService.createWorktree(
      { worktreeID: "recover-create", units: [] },
      options
    );

    await application.worktreeApplication.create(actorUserID, {
      worktreeID: "recover-members",
      name: "Recover members",
      scope: { kind: "user" },
    });
    const personal = application.productStore.ensurePersonalSpace(
      actorUserID,
      "Alice"
    );
    application.productStore.createPending({
      id: "trunk-resource",
      unitID: "trunk-unit",
      type: UniverType.UNIVER_SHEET,
      name: "Trunk sheet",
      spaceID: personal.id,
      parentID: null,
      createdBy: actorUserID,
    });
    const trunkInitial = createInitialUnit(
      UniverType.UNIVER_SHEET,
      "trunk-unit",
      "Trunk sheet"
    );
    await application.collabService.createUnitFromData(
      trunkInitial,
      {
        userID: options.userID,
        customData: options.customData,
      }
    );
    application.productStore.markActive("trunk-resource");

    application.worktreeCatalog.beginOperation({
      operationID: "add-unit:recover-members:trunk-unit",
      kind: "add-unit",
      actorUserID,
      unit: {
        worktreeID: "recover-members",
        unitID: "trunk-unit",
        resourceID: "trunk-resource",
        source: "trunk",
      },
    });
    await application.worktreeService.addUnit(
      { worktreeID: "recover-members", unitID: "trunk-unit" },
      options
    );

    const staged = {
      resourceID: "local-resource",
      worktreeID: "recover-members",
      unitID: "local-doc",
      spaceID: personal.id,
      parentID: null,
      name: "Local doc",
      type: UniverType.UNIVER_DOC,
      createdBy: actorUserID,
    };
    application.worktreeCatalog.beginOperation({
      operationID: "create-unit:recover-members:local-doc",
      kind: "create-unit",
      actorUserID,
      staged,
    });
    application.worktreeCatalog.stageResource(staged);
    const localInitial = createInitialUnit(
      UniverType.UNIVER_DOC,
      "local-doc",
      "Local doc"
    );
    await application.worktreeService.createUnitFromData(
      {
        worktreeID: "recover-members",
        ...localInitial,
      },
      options
    );

    await application.close();
    applications.splice(applications.indexOf(application), 1);
    const recovered = await openApplication(databaseFilename);

    expect(
      await recovered.worktreeApplication.get(
        actorUserID,
        "recover-create"
      )
    ).toMatchObject({ worktreeID: "recover-create", units: [] });
    await expect(
      recovered.worktreeApplication.create(actorUserID, {
        worktreeID: "recover-create",
        name: "Recovered create",
        scope: { kind: "user" },
      })
    ).resolves.toMatchObject({ worktreeID: "recover-create" });
    await expect(
      recovered.worktreeApplication.create(actorUserID, {
        worktreeID: "recover-create",
        name: "Different retry",
        scope: { kind: "user" },
      })
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(
      (
        await recovered.worktreeApplication.get(
          actorUserID,
          "recover-members"
        )
      ).units
    ).toEqual([
      expect.objectContaining({
        unitID: "trunk-unit",
        resourceID: "trunk-resource",
        source: "trunk",
      }),
      expect.objectContaining({
        unitID: "local-doc",
        resourceID: "local-resource",
        source: "worktree",
      }),
    ]);
    expect(
      recovered.worktreeCatalog.listPendingOperations()
    ).toEqual([]);

    await expect(
      recovered.worktreeApplication.createUnit(
        actorUserID,
        "recover-members",
        {
          resourceID: "local-resource",
          unitID: "local-doc",
          spaceID: personal.id,
          name: "Local doc",
          type: UniverType.UNIVER_DOC,
        }
      )
    ).resolves.toMatchObject({ worktreeID: "recover-members" });
    await expect(
      recovered.worktreeApplication.createUnit(
        actorUserID,
        "recover-members",
        {
          resourceID: "local-resource",
          unitID: "local-doc",
          spaceID: personal.id,
          name: "Different retry",
          type: UniverType.UNIVER_DOC,
        }
      )
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});

async function createApplication(): Promise<{
  readonly application: WorkspaceApplication;
  readonly databaseFilename: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "workspace-reconcile-"));
  directories.push(directory);
  const databaseFilename = join(directory, "workspace.sqlite");
  return {
    application: await openApplication(databaseFilename),
    databaseFilename,
  };
}

async function openApplication(
  databaseFilename: string
): Promise<WorkspaceApplication> {
  const application = await createWorkspaceApplication({
    databaseFilename,
    serveClient: false,
  });
  applications.push(application);
  return application;
}
