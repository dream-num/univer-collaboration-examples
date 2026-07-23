import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SuiteApplication } from "../server/application.js";
import { createSuiteApplication } from "../server/application.js";
import { UnitAction, UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it } from "vitest";

const applications: SuiteApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const application of applications.splice(0).reverse()) {
    await application.close();
  }
  for (const directory of directories.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("univer-suite-demo server", () => {
  it("creates, reads and soft-deletes the currently available Unit types", async () => {
    const origin = await startApplication();
    const cookie = await login(origin, "alice", "alice-password");
    const types = [
      UniverType.UNIVER_SHEET,
      UniverType.UNIVER_DOC,
      UniverType.UNIVER_SLIDE,
    ];

    for (const type of types) {
      const created = await json<{
        resource: {
          id: string;
          unitID: string;
          type: UniverType;
          status: string;
        };
      }>(`${origin}/api/units`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ type, name: `Unit ${type}` }),
      });
      expect(created.response.status).toBe(201);
      expect(created.body.resource).toMatchObject({ type, status: "active" });

      const beforeOpen = await json<{ resources: Array<{ id: string }> }>(
        `${origin}/api/units?scope=recent`,
        { headers: { cookie } }
      );
      expect(
        beforeOpen.body.resources.some(
          ({ id }) => id === created.body.resource.id
        )
      ).toBe(false);
      const opened = await json<{
        resource: { id: string; lastOpenedAt: number };
      }>(`${origin}/api/units/${created.body.resource.id}/open`, {
        method: "POST",
        headers: { cookie },
      });
      expect(opened.response.status).toBe(200);
      expect(opened.body.resource).toMatchObject({
        id: created.body.resource.id,
        lastOpenedAt: expect.any(Number),
      });
      const recent = await json<{
        resources: Array<{ id: string; lastOpenedAt: number }>;
      }>(`${origin}/api/units?scope=recent`, { headers: { cookie } });
      expect(recent.body.resources[0]).toMatchObject({
        id: created.body.resource.id,
        lastOpenedAt: opened.body.resource.lastOpenedAt,
      });

      const snapshot = await json<{
        snapshot: { unitID: string; type: UniverType; rev: number };
      }>(
        `${origin}/universer-api/snapshot/${type}/unit/${created.body.resource.unitID}/rev/0`,
        { headers: { cookie } }
      );
      expect(snapshot.response.status).toBe(200);
      expect(snapshot.body.snapshot).toMatchObject({
        unitID: created.body.resource.unitID,
        type,
        rev: 1,
      });
      const history = await json<{ historyIds: string[] }>(
        `${origin}/universer-api/history/${created.body.resource.unitID}/list?length=20`,
        { headers: { cookie } }
      );
      expect(history.response.status).toBe(200);
      expect(history.body.historyIds).toEqual([
        `${created.body.resource.unitID}:1`,
      ]);

      const renamed = await json<{
        resource: { name: string };
      }>(`${origin}/api/units/${created.body.resource.id}`, {
        method: "PATCH",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: `Renamed ${type}` }),
      });
      expect(renamed.response.status).toBe(200);
      expect(renamed.body.resource.name).toBe(`Renamed ${type}`);
      const recentAfterRename = await json<{
        resources: Array<{ id: string; lastOpenedAt: number }>;
      }>(`${origin}/api/units?scope=recent`, { headers: { cookie } });
      expect(
        recentAfterRename.body.resources.find(
          ({ id }) => id === created.body.resource.id
        )?.lastOpenedAt
      ).toBe(opened.body.resource.lastOpenedAt);
      const renamedUnit = await json<{
        resource: { name: string };
      }>(`${origin}/api/units/${created.body.resource.id}`, {
        headers: { cookie },
      });
      expect(renamedUnit.body.resource.name).toBe(`Renamed ${type}`);
      const renamedSnapshot = await json<{
        changesets: Array<{
          mutations: Array<{ id: string; data: string }>;
        }>;
      }>(
        `${origin}/universer-api/snapshot/${type}/unit/${created.body.resource.unitID}/rev/0`,
        { headers: { cookie } }
      );
      expect(
        renamedSnapshot.body.changesets.some((changeset) =>
          changeset.mutations.some(
            (mutation) =>
              JSON.parse(mutation.data).name === `Renamed ${type}`
          )
        )
      ).toBe(true);

      const removed = await fetch(
        `${origin}/api/units/${created.body.resource.id}`,
        { method: "DELETE", headers: { cookie } }
      );
      expect(removed.status).toBe(204);
      const blocked = await fetch(
        `${origin}/universer-api/snapshot/${type}/unit/${created.body.resource.unitID}/rev/0`,
        { headers: { cookie } }
      );
      expect(blocked.status).toBe(404);
      const recentAfterDelete = await json<{
        resources: Array<{ id: string }>;
      }>(`${origin}/api/units?scope=recent`, { headers: { cookie } });
      expect(
        recentAfterDelete.body.resources.some(
          ({ id }) => id === created.body.resource.id
        )
      ).toBe(false);

      const restored = await json<{
        resource: { status: string };
      }>(
        `${origin}/api/units/${created.body.resource.id}/restore`,
        { method: "POST", headers: { cookie } }
      );
      expect(restored.body.resource.status).toBe("active");
      const recentAfterRestore = await json<{
        resources: Array<{ id: string }>;
      }>(`${origin}/api/units?scope=recent`, { headers: { cookie } });
      expect(
        recentAfterRestore.body.resources.some(
          ({ id }) => id === created.body.resource.id
        )
      ).toBe(false);
    }

    const list = await json<{ resources: unknown[] }>(`${origin}/api/units`, {
      headers: { cookie },
    });
    expect(list.body.resources).toHaveLength(types.length);
  });

  it("reports Board and Base creation as unavailable without touching collaboration data", async () => {
    const origin = await startApplication();
    const cookie = await login(origin, "bob", "bob-password");
    for (const type of [
      UniverType.UNIVER_BOARD,
      UniverType.UNIVER_BASE,
    ]) {
      const response = await fetch(`${origin}/api/units`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ type, name: "Unavailable" }),
      });
      expect(response.status).toBe(400);
    }

    const capabilities = await json<{
      creatableUnitTypes: UniverType[];
      unavailableUnitTypes: Array<{ type: UniverType }>;
    }>(`${origin}/api/capabilities`, { headers: { cookie } });
    expect(capabilities.body.creatableUnitTypes).toEqual([
      UniverType.UNIVER_SHEET,
      UniverType.UNIVER_DOC,
      UniverType.UNIVER_SLIDE,
    ]);
    expect(capabilities.body.unavailableUnitTypes.map(({ type }) => type)).toEqual([
      UniverType.UNIVER_BOARD,
      UniverType.UNIVER_BASE,
    ]);
  });

  it("registers, logs in and isolates each user's personal space", async () => {
    const origin = await startApplication();
    const aliceCookie = await login(origin, "alice", "alice-password");
    const bobCookie = await login(origin, "bob", "bob-password");

    const created = await json<{
      resource: { id: string; unitID: string };
    }>(
      `${origin}/api/units`,
      {
        method: "POST",
        headers: {
          cookie: aliceCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          type: UniverType.UNIVER_SHEET,
          name: "Alice only",
        }),
      }
    );
    expect(created.response.status).toBe(201);

    const bobList = await json<{ resources: unknown[] }>(
      `${origin}/api/units`,
      { headers: { cookie: bobCookie } }
    );
    expect(bobList.body.resources).toEqual([]);
    expect(
      await fetch(`${origin}/api/units/${created.body.resource.id}`, {
        headers: { cookie: bobCookie },
      })
    ).toMatchObject({ status: 404 });
    expect(
      await fetch(
        `${origin}/universer-api/history/${created.body.resource.unitID}/list`,
        { headers: { cookie: bobCookie } }
      )
    ).toMatchObject({ status: 404 });

    const loggedIn = await fetch(`${origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: "alice",
        password: "alice-password",
      }),
    });
    expect(loggedIn.status).toBe(200);
    expect(loggedIn.headers.get("set-cookie")).toContain(
      "univer_suite_session="
    );

    const carolCookie = await register(origin, "carol", "carol-password");
    expect(carolCookie).toContain("univer_suite_session=");
  });

  it("shares resources with editor and viewer roles across product and collaboration APIs", async () => {
    const origin = await startApplication();
    const aliceCookie = await login(origin, "alice", "alice-password");
    const bobCookie = await login(origin, "bob", "bob-password");
    const created = await json<{
      resource: {
        id: string;
        unitID: string;
        type: UniverType;
        accessRole: string;
      };
    }>(`${origin}/api/units`, {
      method: "POST",
      headers: {
        cookie: aliceCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        type: UniverType.UNIVER_SHEET,
        name: "Shared budget",
      }),
    });
    expect(created.body.resource.accessRole).toBe("owner");

    const users = await json<{
      users: Array<{ userId: string; username: string }>;
    }>(`${origin}/api/users?query=bob`, {
      headers: { cookie: aliceCookie },
    });
    expect(users.body.users).toHaveLength(1);
    expect(users.body.users[0]?.username).toBe("bob");
    const bobUserId = users.body.users[0]!.userId;

    const invited = await json<{
      member: { role: string; user: { userId: string } };
    }>(`${origin}/api/units/${created.body.resource.id}/members`, {
      method: "POST",
      headers: {
        cookie: aliceCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId: bobUserId, role: "viewer" }),
    });
    expect(invited.response.status).toBe(201);
    expect(invited.body.member).toMatchObject({
      role: "viewer",
      user: { userId: bobUserId },
    });

    const shared = await json<{
      resources: Array<{
        id: string;
        accessRole: string;
        owner: { username: string };
      }>;
    }>(`${origin}/api/units?scope=shared`, {
      headers: { cookie: bobCookie },
    });
    expect(shared.body.resources).toEqual([
      expect.objectContaining({
        id: created.body.resource.id,
        accessRole: "viewer",
        owner: expect.objectContaining({ username: "alice" }),
      }),
    ]);
    const recentBeforeOpen = await json<{ resources: unknown[] }>(
      `${origin}/api/units?scope=recent`,
      { headers: { cookie: bobCookie } }
    );
    expect(recentBeforeOpen.body.resources).toEqual([]);
    expect(
      await fetch(`${origin}/api/units/${created.body.resource.id}`, {
        headers: { cookie: bobCookie },
      })
    ).toMatchObject({ status: 200 });
    const recentAfterRead = await json<{ resources: unknown[] }>(
      `${origin}/api/units?scope=recent`,
      { headers: { cookie: bobCookie } }
    );
    expect(recentAfterRead.body.resources).toEqual([]);
    const openedByBob = await json<{
      resource: {
        id: string;
        accessRole: string;
        lastOpenedAt: number;
      };
    }>(`${origin}/api/units/${created.body.resource.id}/open`, {
      method: "POST",
      headers: { cookie: bobCookie },
    });
    expect(openedByBob.body.resource).toMatchObject({
      id: created.body.resource.id,
      accessRole: "viewer",
      lastOpenedAt: expect.any(Number),
    });
    const recentAfterOpen = await json<{
      resources: Array<{
        id: string;
        accessRole: string;
        lastOpenedAt: number;
      }>;
    }>(`${origin}/api/units?scope=recent`, {
      headers: { cookie: bobCookie },
    });
    expect(recentAfterOpen.body.resources).toEqual([
      expect.objectContaining({
        id: created.body.resource.id,
        accessRole: "viewer",
        lastOpenedAt: openedByBob.body.resource.lastOpenedAt,
      }),
    ]);
    expect(
      await fetch(
        `${origin}/universer-api/snapshot/${UniverType.UNIVER_SHEET}/unit/${created.body.resource.unitID}/rev/0`,
        { headers: { cookie: bobCookie } }
      )
    ).toMatchObject({ status: 200 });
    expect(
      await fetch(
        `${origin}/universer-api/history/${created.body.resource.unitID}/list`,
        { headers: { cookie: bobCookie } }
      )
    ).toMatchObject({ status: 200 });

    const viewerPermissions = await permissionActions(
      origin,
      bobCookie,
      created.body.resource.unitID,
      [
        UnitAction.View,
        UnitAction.Edit,
        UnitAction.ViewHistory,
        UnitAction.RecoverHistory,
      ]
    );
    expect(viewerPermissions).toEqual([
      { action: UnitAction.View, allowed: true },
      { action: UnitAction.Edit, allowed: false },
      { action: UnitAction.ViewHistory, allowed: true },
      { action: UnitAction.RecoverHistory, allowed: false },
    ]);
    expect(
      await fetch(`${origin}/api/units/${created.body.resource.id}`, {
        method: "PATCH",
        headers: {
          cookie: bobCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Viewer cannot rename" }),
      })
    ).toMatchObject({ status: 403 });

    const viewerSubmit =
      await applications.at(-1)!.collabService.submitChangeset(
        {
          changeset: {
            unitID: created.body.resource.unitID,
            type: UniverType.UNIVER_SHEET,
            baseRev: 1,
            revision: 2,
            sid: randomUUID(),
            reqId: 1,
            userID: bobUserId,
            memberID: "bob-viewer",
            mutations: [],
          },
        },
        {
          session: {
            memberId: "bob-viewer",
            userId: bobUserId,
            customData: {},
          },
        }
      );
    expect(viewerSubmit).toMatchObject({
      status: "rejected",
      error: { code: "PERMISSION_DENIED" },
    });

    expect(
      await fetch(
        `${origin}/api/units/${created.body.resource.id}/members`,
        { headers: { cookie: bobCookie } }
      )
    ).toMatchObject({ status: 404 });

    const updated = await json<{ member: { role: string } }>(
      `${origin}/api/units/${created.body.resource.id}/members/${bobUserId}`,
      {
        method: "PATCH",
        headers: {
          cookie: aliceCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: "editor" }),
      }
    );
    expect(updated.body.member.role).toBe("editor");
    expect(
      await permissionActions(
        origin,
        bobCookie,
        created.body.resource.unitID,
        [UnitAction.Edit, UnitAction.ManageCollaborator]
      )
    ).toEqual([
      { action: UnitAction.Edit, allowed: true },
      { action: UnitAction.ManageCollaborator, allowed: false },
    ]);

    const editorRename = await json<{ resource: { name: string } }>(
      `${origin}/api/units/${created.body.resource.id}`,
      {
        method: "PATCH",
        headers: {
          cookie: bobCookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Bob renamed budget" }),
      }
    );
    expect(editorRename.response.status).toBe(200);
    expect(editorRename.body.resource.name).toBe("Bob renamed budget");
    const recentAfterRename = await json<{
      resources: Array<{ id: string; name: string; lastOpenedAt: number }>;
    }>(`${origin}/api/units?scope=recent`, {
      headers: { cookie: bobCookie },
    });
    expect(recentAfterRename.body.resources).toEqual([
      expect.objectContaining({
        id: created.body.resource.id,
        name: "Bob renamed budget",
        lastOpenedAt: openedByBob.body.resource.lastOpenedAt,
      }),
    ]);

    expect(
      await fetch(
        `${origin}/api/units/${created.body.resource.id}/members/${bobUserId}`,
        { method: "DELETE", headers: { cookie: aliceCookie } }
      )
    ).toMatchObject({ status: 204 });
    expect(
      await fetch(`${origin}/api/units/${created.body.resource.id}`, {
        headers: { cookie: bobCookie },
      })
    ).toMatchObject({ status: 404 });
    const recentAfterRevoke = await json<{ resources: unknown[] }>(
      `${origin}/api/units?scope=recent`,
      { headers: { cookie: bobCookie } }
    );
    expect(recentAfterRevoke.body.resources).toEqual([]);
  });
});

async function startApplication(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "univer-suite-demo-"));
  directories.push(directory);
  const application = await createSuiteApplication({
    databaseFilename: join(directory, "suite.sqlite"),
    serveClient: false,
  });
  applications.push(application);
  const port = await application.listen(0);
  return `http://127.0.0.1:${port}`;
}

async function json<T>(
  url: string,
  init?: RequestInit
): Promise<{ response: Response; body: T }> {
  const response = await fetch(url, init);
  return { response, body: (await response.json()) as T };
}

async function register(
  origin: string,
  username: string,
  password: string
): Promise<string> {
  const response = await fetch(`${origin}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(201);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function login(
  origin: string,
  username: string,
  password: string
): Promise<string> {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function permissionActions(
  origin: string,
  cookie: string,
  unitID: string,
  actions: UnitAction[]
): Promise<Array<{ action: UnitAction; allowed: boolean }>> {
  const result = await json<{
    objectActions: Array<{
      actions: Array<{ action: UnitAction; allowed: boolean }>;
    }>;
  }>(`${origin}/universer-api/authz/-/object/-/batch_allowed`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      requests: [{ unitID, objectID: unitID, actions }],
    }),
  });
  expect(result.response.status).toBe(200);
  return result.body.objectActions[0]!.actions;
}
