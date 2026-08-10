import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceApplication } from "../server/application.js";
import { createWorkspaceApplication } from "../server/application.js";

const applications: WorkspaceApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const application of applications.splice(0).reverse()) {
    await application.close();
  }
  for (const directory of directories.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Workspace Demo Unit lifecycle", () => {
  it("soft-deletes and recovers a direct resource in both stores", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Direct");
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");

    expect(
      await fetch(`${origin}/api/units/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    expect(deleteUnits).toHaveBeenCalledOnce();
    expect(application.productStore.getByID(resource.id)?.status).toBe("deleted");
    expect(await snapshotStatus(origin, alice, resource)).toBe(404);

    expect(
      await fetch(`${origin}/api/units/${resource.id}/restore`, {
        method: "POST",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 200 });
    expect(recoverUnits).toHaveBeenCalledOnce();
    expect(application.productStore.getByID(resource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });

  it("uses one sorted Unit batch for a folder subtree trash and restore", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const root = await createFolder(origin, alice, personal.id, null, "Root");
    const child = await createFolder(origin, alice, personal.id, root.id, "Child");
    const first = await createUnit(origin, alice, personal.id, root.id, "First");
    const second = await createUnit(origin, alice, personal.id, child.id, "Second");
    const expectedUnitIDs = [first.unitID, second.unitID].sort();
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");

    expect(
      await fetch(`${origin}/api/nodes/${root.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    expect(deleteUnits).toHaveBeenCalledWith(
      { unitIDs: expectedUnitIDs, hardDelete: false },
      expect.objectContaining({
        userID: "user-alice",
        customData: expect.any(Object),
      })
    );
    expect(await snapshotStatus(origin, alice, first)).toBe(404);
    expect(await snapshotStatus(origin, alice, second)).toBe(404);

    expect(
      await fetch(`${origin}/api/nodes/${root.id}/restore`, {
        method: "POST",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    expect(recoverUnits).toHaveBeenCalledWith(
      { unitIDs: expectedUnitIDs },
      expect.objectContaining({
        userID: "user-alice",
        customData: expect.any(Object),
      })
    );
    expect(await snapshotStatus(origin, alice, first)).toBe(200);
    expect(await snapshotStatus(origin, alice, second)).toBe(200);
  });

  it("rejects protocol lifecycle calls that did not originate in the application", async () => {
    const { origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Private");

    expect(
      await fetch(
        `${origin}/universer-api/snapshot/-/units?unitIds=${resource.unitID}`,
        { method: "DELETE", headers: { cookie: alice } }
      )
    ).toMatchObject({ status: 403 });
    expect(
      await fetch(
        `${origin}/universer-api/snapshot/-/units?unitIds=${resource.unitID}&hardDelete=true`,
        { method: "DELETE", headers: { cookie: alice } }
      )
    ).toMatchObject({ status: 400 });
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });

  it("checks delete authorization for every Unit in the application batch", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const bob = await login(origin, "bob", "bob-password");
    const aliceSpace = await personalSpace(origin, alice);
    const aliceResource = await createUnit(
      origin,
      alice,
      aliceSpace.id,
      null,
      "Alice private"
    );
    const team = await createTeam(origin, alice, "Team");
    await addTeamMember(origin, alice, team.id, "user-bob", "admin");
    const teamResource = await createUnit(origin, alice, team.id, null, "Team unit");
    vi.spyOn(application.productStore, "listSubtreeUnitIDs").mockReturnValue([
      aliceResource.unitID,
      teamResource.unitID,
    ].sort());

    expect(
      await fetch(`${origin}/api/nodes/${teamResource.id}`, {
        method: "DELETE",
        headers: { cookie: bob },
      })
    ).toMatchObject({ status: 403 });
    expect(application.productStore.getByID(teamResource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, teamResource)).toBe(200);
  });

  it("rechecks folder delete authorization after waiting for the lifecycle lock", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const bob = await login(origin, "bob", "bob-password");
    const personal = await personalSpace(origin, alice);
    const holder = await createUnit(origin, alice, personal.id, null, "Lock holder");
    const team = await createTeam(origin, alice, "Team");
    await addTeamMember(origin, alice, team.id, "user-bob", "admin");
    const folder = await createFolder(origin, alice, team.id, null, "Empty folder");
    const firstCollabCall = deferred();
    const releaseFirstCall = deferred();
    const queuedRequestStarted = deferred();
    const originalDeleteUnits = application.collabService.deleteUnits.bind(
      application.collabService
    );
    vi.spyOn(application.collabService, "deleteUnits").mockImplementationOnce(
      async (input, options) => {
        firstCollabCall.resolve();
        await releaseFirstCall.promise;
        return originalDeleteUnits(input, options);
      }
    );
    signalFolderRead(application, folder.id, queuedRequestStarted);

    const holding = fetch(`${origin}/api/nodes/${holder.id}`, {
      method: "DELETE",
      headers: { cookie: alice },
    });
    await firstCollabCall.promise;
    const queued = fetch(`${origin}/api/nodes/${folder.id}`, {
      method: "DELETE",
      headers: { cookie: bob },
    });
    await queuedRequestStarted.promise;
    await removeTeamMember(origin, alice, team.id, "user-bob");
    releaseFirstCall.resolve();

    await expect(holding).resolves.toMatchObject({ status: 204 });
    await expect(queued).resolves.toMatchObject({ status: 403 });
    expect(application.productStore.getFolder(folder.id)?.status).toBe("active");
  });

  it("rechecks folder restore authorization after waiting for the lifecycle lock", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const bob = await login(origin, "bob", "bob-password");
    const personal = await personalSpace(origin, alice);
    const holder = await createUnit(origin, alice, personal.id, null, "Lock holder");
    const team = await createTeam(origin, alice, "Team");
    await addTeamMember(origin, alice, team.id, "user-bob", "admin");
    const folder = await createFolder(origin, alice, team.id, null, "Empty folder");
    expect(
      await fetch(`${origin}/api/nodes/${folder.id}`, {
        method: "DELETE",
        headers: { cookie: bob },
      })
    ).toMatchObject({ status: 204 });
    const firstCollabCall = deferred();
    const releaseFirstCall = deferred();
    const queuedRequestStarted = deferred();
    const originalDeleteUnits = application.collabService.deleteUnits.bind(
      application.collabService
    );
    vi.spyOn(application.collabService, "deleteUnits").mockImplementationOnce(
      async (input, options) => {
        firstCollabCall.resolve();
        await releaseFirstCall.promise;
        return originalDeleteUnits(input, options);
      }
    );
    signalFolderRead(application, folder.id, queuedRequestStarted);

    const holding = fetch(`${origin}/api/nodes/${holder.id}`, {
      method: "DELETE",
      headers: { cookie: alice },
    });
    await firstCollabCall.promise;
    const queued = fetch(`${origin}/api/nodes/${folder.id}/restore`, {
      method: "POST",
      headers: { cookie: bob },
    });
    await queuedRequestStarted.promise;
    await removeTeamMember(origin, alice, team.id, "user-bob");
    releaseFirstCall.resolve();

    await expect(holding).resolves.toMatchObject({ status: 204 });
    await expect(queued).resolves.toMatchObject({ status: 403 });
    expect(application.productStore.getFolder(folder.id)?.status).toBe("deleted");
  });

  it("recovers collaboration state when the product delete fails", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Delete failure");
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");
    vi.spyOn(application.productStore, "softDeleteNode").mockReturnValue(false);

    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 404 });
    expect(deleteUnits).toHaveBeenCalledOnce();
    expect(recoverUnits).toHaveBeenCalledOnce();
    expect(application.productStore.getByID(resource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });

  it("re-deletes collaboration state when the product restore fails", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Recover failure");
    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");
    vi.spyOn(application.productStore, "restoreNode").mockReturnValue(false);

    expect(
      await fetch(`${origin}/api/nodes/${resource.id}/restore`, {
        method: "POST",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 400 });
    expect(recoverUnits).toHaveBeenCalledOnce();
    expect(deleteUnits).toHaveBeenCalledOnce();
    expect(application.productStore.getByID(resource.id)?.status).toBe("deleted");
    expect(await snapshotStatus(origin, alice, resource)).toBe(404);
  });

  it("does not recover a previously trashed descendant when a folder delete fails", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const root = await createFolder(origin, alice, personal.id, null, "Root");
    const child = await createFolder(origin, alice, personal.id, root.id, "Child");
    const active = await createUnit(origin, alice, personal.id, root.id, "Active");
    const trashed = await createUnit(origin, alice, personal.id, child.id, "Trashed");
    expect(
      await fetch(`${origin}/api/nodes/${trashed.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });

    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");
    vi.spyOn(application.productStore, "softDeleteNode").mockReturnValue(false);

    expect(
      await fetch(`${origin}/api/nodes/${root.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 404 });
    expect(deleteUnits).toHaveBeenCalledWith(
      { unitIDs: [active.unitID], hardDelete: false },
      expect.any(Object)
    );
    expect(recoverUnits).toHaveBeenCalledWith(
      { unitIDs: [active.unitID] },
      expect.any(Object)
    );
    expect(application.productStore.getFolder(root.id)?.status).toBe("active");
    expect(application.productStore.getByID(trashed.id)?.status).toBe("deleted");
    expect(await snapshotStatus(origin, alice, active)).toBe(200);
    expect(await snapshotStatus(origin, alice, trashed)).toBe(404);
  });

  it("preflights an oversized subtree before changing either store", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Large subtree");
    vi.spyOn(application.productStore, "listSubtreeUnitIDs").mockReturnValue(
      Array.from({ length: 101 }, (_, index) =>
        index === 0 ? resource.unitID : `oversized-unit-${index}`
      )
    );
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const softDeleteNode = vi.spyOn(application.productStore, "softDeleteNode");

    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 400 });
    expect(deleteUnits).not.toHaveBeenCalled();
    expect(softDeleteNode).not.toHaveBeenCalled();
    expect(application.productStore.getByID(resource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });

  it("rejects a sequential duplicate delete without touching collaboration", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Duplicate delete");
    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");

    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 404 });
    expect(deleteUnits).not.toHaveBeenCalled();
    expect(recoverUnits).not.toHaveBeenCalled();
    expect(application.productStore.getByID(resource.id)?.status).toBe("deleted");
    expect(await snapshotStatus(origin, alice, resource)).toBe(404);
  });

  it("rejects a sequential duplicate restore without touching collaboration", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Duplicate restore");
    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    expect(
      await fetch(`${origin}/api/nodes/${resource.id}/restore`, {
        method: "POST",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");

    expect(
      await fetch(`${origin}/api/nodes/${resource.id}/restore`, {
        method: "POST",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 400 });
    expect(deleteUnits).not.toHaveBeenCalled();
    expect(recoverUnits).not.toHaveBeenCalled();
    expect(application.productStore.getByID(resource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });

  it("serializes concurrent duplicate deletes across both stores", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Concurrent delete");
    const firstCollabCall = deferred();
    const releaseFirstCall = deferred();
    const secondRequestStarted = deferred();
    const originalDeleteUnits = application.collabService.deleteUnits.bind(
      application.collabService
    );
    let deleteCallCount = 0;
    const deleteUnits = vi
      .spyOn(application.collabService, "deleteUnits")
      .mockImplementation(async (input, options) => {
        deleteCallCount += 1;
        if (deleteCallCount === 1) {
          firstCollabCall.resolve();
          await releaseFirstCall.promise;
        }
        return originalDeleteUnits(input, options);
      });
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");
    signalNodeRead(application, resource.id, 3, secondRequestStarted);

    const first = fetch(`${origin}/api/nodes/${resource.id}`, {
      method: "DELETE",
      headers: { cookie: alice },
    });
    await firstCollabCall.promise;
    const second = fetch(`${origin}/api/nodes/${resource.id}`, {
      method: "DELETE",
      headers: { cookie: alice },
    });
    await secondRequestStarted.promise;
    releaseFirstCall.resolve();

    const statuses = (await Promise.all([first, second]))
      .map(({ status }) => status)
      .sort();
    expect(statuses).toEqual([204, 404]);
    expect(deleteUnits).toHaveBeenCalledOnce();
    expect(recoverUnits).not.toHaveBeenCalled();
    expect(application.productStore.getByID(resource.id)?.status).toBe("deleted");
    expect(await snapshotStatus(origin, alice, resource)).toBe(404);
  });

  it("serializes a concurrent delete followed by restore across both stores", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Concurrent lifecycle");
    const firstCollabCall = deferred();
    const releaseFirstCall = deferred();
    const secondRequestStarted = deferred();
    const originalDeleteUnits = application.collabService.deleteUnits.bind(
      application.collabService
    );
    const deleteUnits = vi
      .spyOn(application.collabService, "deleteUnits")
      .mockImplementationOnce(async (input, options) => {
        firstCollabCall.resolve();
        await releaseFirstCall.promise;
        return originalDeleteUnits(input, options);
      });
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");
    signalNodeRead(application, resource.id, 3, secondRequestStarted);

    const deleting = fetch(`${origin}/api/nodes/${resource.id}`, {
      method: "DELETE",
      headers: { cookie: alice },
    });
    await firstCollabCall.promise;
    const restoring = fetch(`${origin}/api/nodes/${resource.id}/restore`, {
      method: "POST",
      headers: { cookie: alice },
    });
    await secondRequestStarted.promise;
    releaseFirstCall.resolve();

    await expect(deleting).resolves.toMatchObject({ status: 204 });
    await expect(restoring).resolves.toMatchObject({ status: 204 });
    expect(deleteUnits).toHaveBeenCalledOnce();
    expect(recoverUnits).toHaveBeenCalledOnce();
    expect(application.productStore.getByID(resource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });

  it("serializes a concurrent direct Unit delete followed by restore", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(
      origin,
      alice,
      personal.id,
      null,
      "Concurrent direct lifecycle"
    );
    const firstCollabCall = deferred();
    const releaseFirstCall = deferred();
    const secondRequestStarted = deferred();
    const originalDeleteUnits = application.collabService.deleteUnits.bind(
      application.collabService
    );
    const deleteUnits = vi
      .spyOn(application.collabService, "deleteUnits")
      .mockImplementationOnce(async (input, options) => {
        firstCollabCall.resolve();
        await releaseFirstCall.promise;
        return originalDeleteUnits(input, options);
      });
    const recoverUnits = vi.spyOn(application.collabService, "recoverUnits");

    const deleting = fetch(`${origin}/api/units/${resource.id}`, {
      method: "DELETE",
      headers: { cookie: alice },
    });
    await firstCollabCall.promise;
    signalNodeRead(application, resource.id, 1, secondRequestStarted);
    const restoring = fetch(`${origin}/api/units/${resource.id}/restore`, {
      method: "POST",
      headers: { cookie: alice },
    });
    await secondRequestStarted.promise;
    releaseFirstCall.resolve();

    await expect(deleting).resolves.toMatchObject({ status: 204 });
    await expect(restoring).resolves.toMatchObject({ status: 200 });
    expect(deleteUnits).toHaveBeenCalledOnce();
    expect(recoverUnits).toHaveBeenCalledOnce();
    expect(application.productStore.getByID(resource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });

  it("serializes a concurrent direct Unit restore followed by delete", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(
      origin,
      alice,
      personal.id,
      null,
      "Concurrent reverse direct lifecycle"
    );
    expect(
      await fetch(`${origin}/api/units/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });

    const firstCollabCall = deferred();
    const releaseFirstCall = deferred();
    const secondRequestStarted = deferred();
    const originalRecoverUnits = application.collabService.recoverUnits.bind(
      application.collabService
    );
    const recoverUnits = vi
      .spyOn(application.collabService, "recoverUnits")
      .mockImplementationOnce(async (input, options) => {
        firstCollabCall.resolve();
        await releaseFirstCall.promise;
        return originalRecoverUnits(input, options);
      });
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");

    const restoring = fetch(`${origin}/api/units/${resource.id}/restore`, {
      method: "POST",
      headers: { cookie: alice },
    });
    await firstCollabCall.promise;
    signalNodeRead(application, resource.id, 1, secondRequestStarted);
    const deleting = fetch(`${origin}/api/units/${resource.id}`, {
      method: "DELETE",
      headers: { cookie: alice },
    });
    await secondRequestStarted.promise;
    releaseFirstCall.resolve();

    await expect(restoring).resolves.toMatchObject({ status: 200 });
    await expect(deleting).resolves.toMatchObject({ status: 204 });
    expect(recoverUnits).toHaveBeenCalledOnce();
    expect(deleteUnits).toHaveBeenCalledOnce();
    expect(application.productStore.getByID(resource.id)?.status).toBe("deleted");
    expect(await snapshotStatus(origin, alice, resource)).toBe(404);
  });

  it("serializes concurrent duplicate restores across both stores", async () => {
    const { application, origin } = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(origin, alice, personal.id, null, "Concurrent restore");
    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    const firstCollabCall = deferred();
    const releaseFirstCall = deferred();
    const secondRequestStarted = deferred();
    const originalRecoverUnits = application.collabService.recoverUnits.bind(
      application.collabService
    );
    let recoverCallCount = 0;
    const recoverUnits = vi
      .spyOn(application.collabService, "recoverUnits")
      .mockImplementation(async (input, options) => {
        recoverCallCount += 1;
        if (recoverCallCount === 1) {
          firstCollabCall.resolve();
          await releaseFirstCall.promise;
        }
        return originalRecoverUnits(input, options);
      });
    const deleteUnits = vi.spyOn(application.collabService, "deleteUnits");
    signalNodeRead(application, resource.id, 3, secondRequestStarted);

    const first = fetch(`${origin}/api/nodes/${resource.id}/restore`, {
      method: "POST",
      headers: { cookie: alice },
    });
    await firstCollabCall.promise;
    const second = fetch(`${origin}/api/nodes/${resource.id}/restore`, {
      method: "POST",
      headers: { cookie: alice },
    });
    await secondRequestStarted.promise;
    releaseFirstCall.resolve();

    const statuses = (await Promise.all([first, second]))
      .map(({ status }) => status)
      .sort();
    expect(statuses).toEqual([204, 400]);
    expect(recoverUnits).toHaveBeenCalledOnce();
    expect(deleteUnits).not.toHaveBeenCalled();
    expect(application.productStore.getByID(resource.id)?.status).toBe("active");
    expect(await snapshotStatus(origin, alice, resource)).toBe(200);
  });
});

interface Resource {
  readonly id: string;
  readonly unitID: string;
  readonly type: UniverType;
}

async function startApplication(): Promise<{
  application: WorkspaceApplication;
  origin: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "univer-workspace-lifecycle-"));
  directories.push(directory);
  const application = await createWorkspaceApplication({
    databaseFilename: join(directory, "workspace.sqlite"),
    serveClient: false,
  });
  applications.push(application);
  const port = await application.listen(0);
  return { application, origin: `http://127.0.0.1:${port}` };
}

async function login(origin: string, username: string, password: string) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function personalSpace(origin: string, cookie: string) {
  const response = await fetch(`${origin}/api/spaces`, { headers: { cookie } });
  const body = (await response.json()) as {
    spaces: Array<{ id: string; type: string }>;
  };
  return body.spaces.find(({ type }) => type === "personal")!;
}

async function createTeam(origin: string, cookie: string, name: string) {
  const response = await fetch(`${origin}/api/spaces`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { space: { id: string } }).space;
}

async function addTeamMember(
  origin: string,
  cookie: string,
  spaceID: string,
  userId: string,
  role: "admin" | "editor" | "viewer"
) {
  const response = await fetch(`${origin}/api/spaces/${spaceID}/members`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ userId, role }),
  });
  expect(response.status).toBe(201);
}

async function removeTeamMember(
  origin: string,
  cookie: string,
  spaceID: string,
  userId: string
) {
  const response = await fetch(
    `${origin}/api/spaces/${spaceID}/members/${userId}`,
    { method: "DELETE", headers: { cookie } }
  );
  expect(response.status).toBe(204);
}

async function createFolder(
  origin: string,
  cookie: string,
  spaceID: string,
  parentID: string | null,
  name: string
) {
  const response = await fetch(`${origin}/api/spaces/${spaceID}/folders`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ parentID, name }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { folder: { id: string } }).folder;
}

async function createUnit(
  origin: string,
  cookie: string,
  spaceID: string,
  parentID: string | null,
  name: string
): Promise<Resource> {
  const response = await fetch(`${origin}/api/units`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      spaceID,
      parentID,
      type: UniverType.UNIVER_SHEET,
      name,
    }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { resource: Resource }).resource;
}

function snapshotStatus(origin: string, cookie: string, resource: Resource) {
  return fetch(
    `${origin}/universer-api/snapshot/${resource.type}/unit/${resource.unitID}/rev/0`,
    { headers: { cookie } }
  ).then((response) => response.status);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function signalNodeRead(
  application: WorkspaceApplication,
  nodeID: string,
  targetReads: number,
  signal: ReturnType<typeof deferred>
): void {
  const originalGetByID = application.productStore.getByID.bind(
    application.productStore
  );
  let reads = 0;
  vi.spyOn(application.productStore, "getByID").mockImplementation((id) => {
    const result = originalGetByID(id);
    if (id === nodeID) {
      reads += 1;
      if (reads === targetReads) signal.resolve();
    }
    return result;
  });
}

function signalFolderRead(
  application: WorkspaceApplication,
  folderID: string,
  signal: ReturnType<typeof deferred>
): void {
  const originalGetFolder = application.productStore.getFolder.bind(
    application.productStore
  );
  vi.spyOn(application.productStore, "getFolder").mockImplementation((id) => {
    const result = originalGetFolder(id);
    if (id === folderID) signal.resolve();
    return result;
  });
}
