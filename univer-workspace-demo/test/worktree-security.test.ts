import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it } from "vitest";
import {
  createWorkspaceApplication,
  type WorkspaceApplication,
} from "../server/application.js";
import { createInitialUnit } from "../server/unit-data.js";

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

describe("Workspace Worktree security", () => {
  it("rejects raw Worktree management that bypasses the application", async () => {
    const application = await createApplication();

    await expect(
      application.worktreeService.createWorktree(
        { worktreeID: "raw-management", units: [] },
        {
          userID: "user-alice",
          customData: Object.create(null) as Record<string, unknown>,
        }
      )
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("rejects local Unit identities already used by the ProductStore", async () => {
    const application = await createApplication();
    const actorUserID = "user-alice";
    const personal = application.productStore.ensurePersonalSpace(
      actorUserID,
      "Alice"
    );
    application.productStore.createPending({
      id: "product-collision-resource",
      unitID: "product-collision-unit",
      type: UniverType.UNIVER_SHEET,
      name: "Existing product Unit",
      spaceID: personal.id,
      parentID: null,
      createdBy: actorUserID,
    });
    await application.worktreeApplication.create(actorUserID, {
      worktreeID: "local-identity-collision",
      name: "Local identity collision",
      scope: { kind: "user" },
    });

    await expect(
      application.worktreeApplication.createUnit(
        actorUserID,
        "local-identity-collision",
        {
          resourceID: "product-collision-resource",
          unitID: "new-local-unit",
          spaceID: personal.id,
          name: "Resource collision",
          type: UniverType.UNIVER_DOC,
        }
      )
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    await expect(
      application.worktreeApplication.createUnit(
        actorUserID,
        "local-identity-collision",
        {
          resourceID: "new-local-resource",
          unitID: "product-collision-unit",
          spaceID: personal.id,
          name: "Unit collision",
          type: UniverType.UNIVER_DOC,
        }
      )
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(application.worktreeCatalog.listPendingOperations()).toEqual([]);
  });

  it("preserves per-Unit partial merge facts when one resource ACL is revoked", async () => {
    const application = await createApplication();
    const ownerUserID = "user-bob";
    const actorUserID = "user-alice";
    const personal = application.productStore.ensurePersonalSpace(
      ownerUserID,
      "Bob"
    );
    for (const index of [1, 2]) {
      application.productStore.createPending({
        id: `shared-resource-${index}`,
        unitID: `shared-unit-${index}`,
        type: UniverType.UNIVER_SHEET,
        name: `Shared ${index}`,
        spaceID: personal.id,
        parentID: null,
        createdBy: ownerUserID,
      });
      const initial = createInitialUnit(
        UniverType.UNIVER_SHEET,
        `shared-unit-${index}`,
        `Shared ${index}`
      );
      await application.collabService.createUnitFromData(
        initial,
        {
          userID: ownerUserID,
          customData: Object.create(null) as Record<string, unknown>,
        }
      );
      application.productStore.markActive(`shared-resource-${index}`);
      application.productStore.setResourceMember({
        resourceID: `shared-resource-${index}`,
        userId: actorUserID,
        role: "editor",
        invitedBy: ownerUserID,
      });
    }
    await application.worktreeApplication.create(actorUserID, {
      worktreeID: "partial-acl-merge",
      name: "Partial ACL merge",
      scope: { kind: "user" },
      resourceIDs: ["shared-resource-1", "shared-resource-2"],
    });
    for (const index of [1, 2]) {
      await application.worktreeApplication.submitChangeset(
        actorUserID,
        "partial-acl-merge",
        `shared-unit-${index}`,
        {
          unitID: `shared-unit-${index}`,
          type: UniverType.UNIVER_SHEET,
          baseRev: 1,
          revision: 2,
          sid: randomUUID(),
          reqId: 1,
          userID: "",
          memberID: "",
          mutations: [
            {
              id: "sheet.mutation.set-workbook-name",
              data: JSON.stringify({
                unitId: `shared-unit-${index}`,
                name: `Draft ${index}`,
              }),
            },
          ],
        }
      );
    }
    await application.worktreeApplication.ready(
      actorUserID,
      "partial-acl-merge"
    );
    application.productStore.removeResourceMember(
      "shared-resource-2",
      actorUserID
    );

    await expect(
      application.worktreeApplication.merge(
        actorUserID,
        "partial-acl-merge"
      )
    ).resolves.toMatchObject({
      status: "ready",
      units: [
        {
          unitID: "shared-unit-1",
          mergeResult: { status: "merged" },
        },
        {
          unitID: "shared-unit-2",
          mergeResult: {
            status: "failed",
            error: { code: "UNIT_NOT_FOUND", retryable: false },
          },
        },
      ],
    });
  });

  it("lets a current Team manager merge another creator's local Unit", async () => {
    const application = await createApplication();
    const team = application.productStore.createTeam({
      id: "team-managed-merge",
      name: "Managed merge",
      ownerUserId: "user-bob",
    });
    application.productStore.setSpaceMember({
      spaceID: team.id,
      userId: "user-alice",
      role: "editor",
      invitedBy: "user-bob",
    });
    await application.worktreeApplication.create("user-alice", {
      worktreeID: "managed-local-merge",
      name: "Managed local merge",
      scope: { kind: "space", spaceID: team.id },
      visibility: "space",
    });
    await application.worktreeApplication.createUnit(
      "user-alice",
      "managed-local-merge",
      {
        resourceID: "managed-local-resource",
        unitID: "managed-local-unit",
        spaceID: team.id,
        name: "Managed local Unit",
        type: UniverType.UNIVER_DOC,
      }
    );
    await application.worktreeApplication.ready(
      "user-alice",
      "managed-local-merge"
    );

    await expect(
      application.worktreeApplication.merge(
        "user-bob",
        "managed-local-merge"
      )
    ).resolves.toMatchObject({
      status: "merged",
      units: [
        {
          unitID: "managed-local-unit",
          resourceStatus: "active",
          mergeResult: { status: "merged" },
        },
      ],
    });
  });

  it("revokes scoped reads for a local Unit when target-Space access is removed", async () => {
    const application = await createApplication();
    const team = application.productStore.createTeam({
      id: "team-security",
      name: "Security",
      ownerUserId: "user-bob",
    });
    application.productStore.setSpaceMember({
      spaceID: team.id,
      userId: "user-alice",
      role: "editor",
      invitedBy: "user-bob",
    });
    await application.worktreeApplication.create("user-alice", {
      worktreeID: "revoked-local-read",
      name: "Revoked local read",
      scope: { kind: "user" },
    });
    await application.worktreeApplication.createUnit(
      "user-alice",
      "revoked-local-read",
      {
        resourceID: "revoked-local-resource",
        unitID: "revoked-local-unit",
        spaceID: team.id,
        name: "Revoked local unit",
        type: UniverType.UNIVER_DOC,
      }
    );

    expect(
      (
        await application.worktreeService.getUnit(
          {
            worktreeID: "revoked-local-read",
            unitID: "revoked-local-unit",
            type: UniverType.UNIVER_DOC,
            revision: 0,
          },
          {
            userID: "user-alice",
            customData: Object.create(null) as Record<string, unknown>,
          }
        )
      ).snapshot.unitID
    ).toBe("revoked-local-unit");

    application.productStore.removeSpaceMember(team.id, "user-alice");

    await expect(
      application.worktreeService.getUnit(
        {
          worktreeID: "revoked-local-read",
          unitID: "revoked-local-unit",
          type: UniverType.UNIVER_DOC,
          revision: 0,
        },
        {
          userID: "user-alice",
          customData: Object.create(null) as Record<string, unknown>,
        }
      )
    ).rejects.toMatchObject({ code: "UNIT_NOT_FOUND" });
  });
});

async function createApplication(): Promise<WorkspaceApplication> {
  const directory = await mkdtemp(join(tmpdir(), "workspace-security-"));
  directories.push(directory);
  const application = await createWorkspaceApplication({
    databaseFilename: join(directory, "workspace.sqlite"),
    serveClient: false,
  });
  applications.push(application);
  return application;
}
