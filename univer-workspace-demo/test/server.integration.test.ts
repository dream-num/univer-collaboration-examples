import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnitAction, UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceApplication } from "../server/application.js";
import { createWorkspaceApplication } from "../server/application.js";

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

describe("univer-workspace-demo spaces", () => {
  it("organizes all Unit types in personal folders and restores a deleted subtree", async () => {
    const origin = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const personal = await personalSpace(origin, alice);
    const project = await createFolder(
      origin,
      alice,
      personal.id,
      null,
      "Project 2026"
    );
    const planning = await createFolder(
      origin,
      alice,
      personal.id,
      project.id,
      "Planning"
    );

    for (const type of [
      UniverType.UNIVER_SHEET,
      UniverType.UNIVER_DOC,
      UniverType.UNIVER_SLIDE,
    ]) {
      const resource = await createUnit(
        origin,
        alice,
        personal.id,
        planning.id,
        type,
        `Unit ${type}`
      );
      expect(resource).toMatchObject({
        type,
        parentID: planning.id,
        space: { id: personal.id, type: "personal" },
        accessRole: "owner",
      });

      const snapshot = await json<{
        snapshot: { unitID: string; type: UniverType; rev: number };
      }>(
        `${origin}/universer-api/snapshot/${type}/unit/${resource.unitID}/rev/0`,
        { headers: { cookie: alice } }
      );
      expect(snapshot.body.snapshot).toMatchObject({
        unitID: resource.unitID,
        type,
        rev: 1,
      });

      const opened = await json<{
        resource: { id: string; lastOpenedAt: number };
      }>(`${origin}/api/units/${resource.id}/open`, {
        method: "POST",
        headers: { cookie: alice },
      });
      expect(opened.body.resource.lastOpenedAt).toEqual(expect.any(Number));

      const renamed = await json<{ resource: { name: string } }>(
        `${origin}/api/units/${resource.id}`,
        {
          method: "PATCH",
          headers: { cookie: alice, "content-type": "application/json" },
          body: JSON.stringify({ name: `Renamed ${type}` }),
        }
      );
      expect(renamed.body.resource.name).toBe(`Renamed ${type}`);
    }

    const directory = await json<{
      breadcrumbs: Array<{ id: string; name: string }>;
      nodes: Array<{ kind: string; name: string }>;
    }>(
      `${origin}/api/spaces/${personal.id}/nodes?parentID=${planning.id}`,
      { headers: { cookie: alice } }
    );
    expect(directory.body.breadcrumbs.map(({ name }) => name)).toEqual([
      "Project 2026",
      "Planning",
    ]);
    expect(directory.body.nodes).toHaveLength(3);
    expect(directory.body.nodes.every(({ kind }) => kind === "unit")).toBe(
      true
    );

    expect(
      await fetch(`${origin}/api/nodes/${project.id}`, {
        method: "DELETE",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    const trash = await json<{
      nodes: Array<{ id: string; kind: string }>;
    }>(`${origin}/api/spaces/${personal.id}/trash`, {
      headers: { cookie: alice },
    });
    expect(trash.body.nodes).toEqual([
      expect.objectContaining({ id: project.id, kind: "folder" }),
    ]);
    const recentAfterDelete = await json<{ resources: unknown[] }>(
      `${origin}/api/units?scope=recent`,
      { headers: { cookie: alice } }
    );
    expect(recentAfterDelete.body.resources).toEqual([]);

    expect(
      await fetch(`${origin}/api/nodes/${project.id}/restore`, {
        method: "POST",
        headers: { cookie: alice },
      })
    ).toMatchObject({ status: 204 });
    const restored = await json<{ nodes: Array<{ id: string }> }>(
      `${origin}/api/spaces/${personal.id}/nodes`,
      { headers: { cookie: alice } }
    );
    expect(restored.body.nodes).toEqual([
      expect.objectContaining({ id: project.id }),
    ]);
    const recentAfterRestore = await json<{ resources: unknown[] }>(
      `${origin}/api/units?scope=recent`,
      { headers: { cookie: alice } }
    );
    expect(recentAfterRestore.body.resources).toEqual([]);
  });

  it("shares only personal documents with explicit users and never grants link access", async () => {
    const origin = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const bob = await login(origin, "bob", "bob-password");
    const personal = await personalSpace(origin, alice);
    const resource = await createUnit(
      origin,
      alice,
      personal.id,
      null,
      UniverType.UNIVER_SHEET,
      "Personal budget"
    );
    const bobUser = await findUser(origin, alice, "bob");

    expect(
      await fetch(`${origin}/api/units/${resource.id}`, {
        headers: { cookie: bob },
      })
    ).toMatchObject({ status: 404 });
    const invited = await json<{
      member: { role: string; user: { userId: string } };
    }>(`${origin}/api/units/${resource.id}/members`, {
      method: "POST",
      headers: { cookie: alice, "content-type": "application/json" },
      body: JSON.stringify({ userId: bobUser.userId, role: "viewer" }),
    });
    expect(invited.body.member).toMatchObject({
      role: "viewer",
      user: { userId: bobUser.userId },
    });

    const shared = await json<{
      resources: Array<{ id: string; accessRole: string }>;
    }>(`${origin}/api/units?scope=shared`, {
      headers: { cookie: bob },
    });
    expect(shared.body.resources).toEqual([
      expect.objectContaining({ id: resource.id, accessRole: "viewer" }),
    ]);
    expect(
      await fetch(`${origin}/api/units/${resource.id}`, {
        method: "PATCH",
        headers: { cookie: bob, "content-type": "application/json" },
        body: JSON.stringify({ name: "Blocked" }),
      })
    ).toMatchObject({ status: 403 });
    expect(
      await permissionActions(origin, bob, resource.unitID, [
        UnitAction.View,
        UnitAction.Edit,
        UnitAction.Share,
      ])
    ).toEqual([
      { action: UnitAction.View, allowed: true },
      { action: UnitAction.Edit, allowed: false },
      { action: UnitAction.Share, allowed: false },
    ]);

    await json(
      `${origin}/api/units/${resource.id}/members/${bobUser.userId}`,
      {
        method: "PATCH",
        headers: { cookie: alice, "content-type": "application/json" },
        body: JSON.stringify({ role: "editor" }),
      }
    );
    expect(
      await fetch(`${origin}/api/units/${resource.id}`, {
        method: "PATCH",
        headers: { cookie: bob, "content-type": "application/json" },
        body: JSON.stringify({ name: "Bob edited" }),
      })
    ).toMatchObject({ status: 200 });

    expect(
      await fetch(
        `${origin}/api/units/${resource.id}/members/${bobUser.userId}`,
        { method: "DELETE", headers: { cookie: alice } }
      )
    ).toMatchObject({ status: 204 });
    expect(
      await fetch(
        `${origin}/universer-api/snapshot/${resource.type}/unit/${resource.unitID}/rev/0`,
        { headers: { cookie: bob } }
      )
    ).toMatchObject({ status: 404 });
  });

  it("enforces owner, admin, editor and viewer rules across a team directory", async () => {
    const origin = await startApplication();
    const alice = await login(origin, "alice", "alice-password");
    const bob = await login(origin, "bob", "bob-password");
    const carol = await register(origin, "carol", "carol-password");
    const dave = await register(origin, "dave", "dave-password");
    const erin = await register(origin, "erin", "erin-password");
    const bobUser = await findUser(origin, alice, "bob");
    const carolUser = await findUser(origin, alice, "carol");
    const daveUser = await findUser(origin, alice, "dave");
    const erinUser = await findUser(origin, alice, "erin");

    const createdTeam = await json<{
      space: { id: string; type: string; accessRole: string };
    }>(`${origin}/api/spaces`, {
      method: "POST",
      headers: { cookie: alice, "content-type": "application/json" },
      body: JSON.stringify({ name: "Product Team" }),
    });
    expect(createdTeam.body.space).toMatchObject({
      type: "team",
      accessRole: "owner",
    });
    const teamID = createdTeam.body.space.id;

    await addTeamMember(origin, alice, teamID, bobUser.userId, "admin");
    await addTeamMember(origin, alice, teamID, carolUser.userId, "editor");
    await addTeamMember(origin, alice, teamID, daveUser.userId, "viewer");

    expect(
      await fetch(
        `${origin}/api/spaces/${teamID}/members/${carolUser.userId}`,
        {
          method: "PATCH",
          headers: { cookie: bob, "content-type": "application/json" },
          body: JSON.stringify({ role: "admin" }),
        }
      )
    ).toMatchObject({ status: 403 });
    expect(
      await fetch(
        `${origin}/api/spaces/${teamID}/members/${bobUser.userId}`,
        {
          method: "PATCH",
          headers: { cookie: bob, "content-type": "application/json" },
          body: JSON.stringify({ role: "editor" }),
        }
      )
    ).toMatchObject({ status: 403 });

    const invitedByAdmin = await addTeamMember(
      origin,
      bob,
      teamID,
      erinUser.userId,
      "viewer"
    );
    expect(invitedByAdmin.role).toBe("viewer");
    expect(
      await fetch(`${origin}/api/spaces/${teamID}/members`, {
        method: "POST",
        headers: { cookie: bob, "content-type": "application/json" },
        body: JSON.stringify({ userId: randomUUID(), role: "admin" }),
      })
    ).toMatchObject({ status: 400 });

    const folder = await createFolder(
      origin,
      carol,
      teamID,
      null,
      "Roadmap"
    );
    const resource = await createUnit(
      origin,
      carol,
      teamID,
      folder.id,
      UniverType.UNIVER_DOC,
      "Launch plan"
    );
    expect(resource.accessRole).toBe("editor");

    expect(
      await fetch(`${origin}/api/nodes/${resource.id}`, {
        method: "DELETE",
        headers: { cookie: carol },
      })
    ).toMatchObject({ status: 403 });
    expect(
      await fetch(`${origin}/api/units`, {
        method: "POST",
        headers: { cookie: dave, "content-type": "application/json" },
        body: JSON.stringify({
          spaceID: teamID,
          type: UniverType.UNIVER_DOC,
          name: "Viewer blocked",
        }),
      })
    ).toMatchObject({ status: 403 });
    expect(
      await fetch(`${origin}/api/units/${resource.id}`, {
        method: "PATCH",
        headers: { cookie: dave, "content-type": "application/json" },
        body: JSON.stringify({ name: "Viewer blocked" }),
      })
    ).toMatchObject({ status: 403 });

    const openedByDave = await json<{
      resource: { accessRole: string };
    }>(`${origin}/api/units/${resource.id}/open`, {
      method: "POST",
      headers: { cookie: dave },
    });
    expect(openedByDave.body.resource.accessRole).toBe("viewer");

    expect(
      await fetch(`${origin}/api/nodes/${folder.id}`, {
        method: "DELETE",
        headers: { cookie: bob },
      })
    ).toMatchObject({ status: 204 });
    expect(
      await fetch(`${origin}/api/nodes/${folder.id}/restore`, {
        method: "POST",
        headers: { cookie: bob },
      })
    ).toMatchObject({ status: 204 });

    expect(
      await fetch(
        `${origin}/api/spaces/${teamID}/members/${daveUser.userId}`,
        { method: "DELETE", headers: { cookie: bob } }
      )
    ).toMatchObject({ status: 204 });
    expect(
      await fetch(`${origin}/api/units/${resource.id}`, {
        headers: { cookie: dave },
      })
    ).toMatchObject({ status: 404 });
    const daveRecent = await json<{ resources: unknown[] }>(
      `${origin}/api/units?scope=recent`,
      { headers: { cookie: dave } }
    );
    expect(daveRecent.body.resources).toEqual([]);

    const members = await json<{
      members: Array<{ role: string; user: { username: string } }>;
    }>(`${origin}/api/spaces/${teamID}/members`, {
      headers: { cookie: erin },
    });
    expect(members.body.members.map(({ role }) => role)).toEqual([
      "owner",
      "admin",
      "editor",
      "viewer",
    ]);
  });
});

interface Resource {
  readonly id: string;
  readonly unitID: string;
  readonly type: UniverType;
  readonly parentID: string | null;
  readonly accessRole: string;
  readonly space: { readonly id: string; readonly type: string };
}

async function startApplication(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "univer-workspace-demo-"));
  directories.push(directory);
  const application = await createWorkspaceApplication({
    databaseFilename: join(directory, "workspace.sqlite"),
    serveClient: false,
  });
  applications.push(application);
  const port = await application.listen(0);
  return `http://127.0.0.1:${port}`;
}

async function json<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<{ response: Response; body: T }> {
  const response = await fetch(url, init);
  return { response, body: (await response.json()) as T };
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

async function personalSpace(
  origin: string,
  cookie: string
): Promise<{ id: string }> {
  const result = await json<{
    spaces: Array<{ id: string; type: string }>;
  }>(`${origin}/api/spaces`, { headers: { cookie } });
  return result.body.spaces.find(({ type }) => type === "personal")!;
}

async function createFolder(
  origin: string,
  cookie: string,
  spaceID: string,
  parentID: string | null,
  name: string
): Promise<{ id: string }> {
  const result = await json<{ folder: { id: string } }>(
    `${origin}/api/spaces/${spaceID}/folders`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ parentID, name }),
    }
  );
  expect(result.response.status).toBe(201);
  return result.body.folder;
}

async function createUnit(
  origin: string,
  cookie: string,
  spaceID: string,
  parentID: string | null,
  type: UniverType,
  name: string
): Promise<Resource> {
  const result = await json<{ resource: Resource }>(
    `${origin}/api/units`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ spaceID, parentID, type, name }),
    }
  );
  expect(result.response.status).toBe(201);
  return result.body.resource;
}

async function findUser(
  origin: string,
  cookie: string,
  query: string
): Promise<{ userId: string }> {
  const result = await json<{
    users: Array<{ userId: string; username: string }>;
  }>(`${origin}/api/users?query=${encodeURIComponent(query)}`, {
    headers: { cookie },
  });
  return result.body.users[0]!;
}

async function addTeamMember(
  origin: string,
  cookie: string,
  spaceID: string,
  userId: string,
  role: "admin" | "editor" | "viewer"
): Promise<{ role: string }> {
  const result = await json<{ member: { role: string } }>(
    `${origin}/api/spaces/${spaceID}/members`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ userId, role }),
    }
  );
  expect(result.response.status).toBe(201);
  return result.body.member;
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
  return result.body.objectActions[0]!.actions;
}
