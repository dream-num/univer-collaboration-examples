import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnitAction, UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { AUTH_COOKIE_NAME } from "../server/auth.js";
import {
  createBasicSheetsAuthApplication,
  type BasicSheetsAuthApplication,
} from "../server/application.js";

const applications: BasicSheetsAuthApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.allSettled(applications.splice(0).map((app) => app.close()));
  await Promise.allSettled(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("basic-sheets-auth server integration", () => {
  it("authenticates with HttpOnly JWT and rejects anonymous protocol calls", async () => {
    const running = await start();
    const invalid = await fetch(`${running.origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "wrong" }),
    });
    expect(invalid.status).toBe(401);

    const anonymousTicket = await fetch(
      `${running.origin}/universer-api/user/session-ticket`
    );
    expect(anonymousTicket.status).toBe(401);

    const alice = await signIn(running.origin, "alice", "alice-password");
    expect(alice.setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(alice.setCookie).toContain("HttpOnly");
    expect(alice.setCookie).toContain("SameSite=Lax");

    const me = await fetch(`${running.origin}/api/auth/me`, {
      headers: { cookie: alice.cookie },
    });
    await expect(me.json()).resolves.toMatchObject({
      user: { userId: "user-alice", username: "alice", name: "Alice" },
    });

    const ticket = await fetch(
      `${running.origin}/universer-api/user/session-ticket`,
      { headers: { cookie: alice.cookie } }
    );
    expect(ticket.status).toBe(200);
    await expect(ticket.json()).resolves.toMatchObject({
      error: { message: "" },
      ticket: expect.any(String),
    });
  });

  it("persists Sheet, history and owner/editor/viewer ACL across restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "basic-sheets-auth-"));
    directories.push(directory);
    const filename = join(directory, "demo.sqlite");
    let running = await start(filename);
    let alice = await signIn(running.origin, "alice", "alice-password");
    let bob = await signIn(running.origin, "bob", "bob-password");

    const create = await fetch(
      `${running.origin}/universer-api/snapshot/2/unit/-/create`,
      {
        method: "POST",
        headers: {
          cookie: alice.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Authenticated Sheet" }),
      }
    );
    expect(create.status).toBe(201);
    const { unitID } = (await create.json()) as { readonly unitID: string };

    const ownerSnapshot = await fetch(
      `${running.origin}/universer-api/snapshot/2/unit/${unitID}/rev/1`,
      { headers: { cookie: alice.cookie } }
    );
    expect(ownerSnapshot.status).toBe(200);
    await expect(ownerSnapshot.json()).resolves.toMatchObject({
      snapshot: { unitID, rev: 1, type: UniverType.UNIVER_SHEET },
    });

    const denied = await fetch(
      `${running.origin}/api/units/${unitID}/access`,
      { headers: { cookie: bob.cookie } }
    );
    expect(denied.status).toBe(403);

    const grantViewer = await grant(
      running.origin,
      alice.cookie,
      unitID,
      "user-bob",
      "viewer"
    );
    expect(grantViewer.status).toBe(200);

    const actions = await fetch(
      `${running.origin}/universer-api/authz/-/object/-/batch_allowed`,
      {
        method: "POST",
        headers: {
          cookie: bob.cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          requests: [
            {
              unitID,
              objectID: unitID,
              actions: [UnitAction.View, UnitAction.Edit, UnitAction.Share],
            },
          ],
        }),
      }
    );
    await expect(actions.json()).resolves.toMatchObject({
      objectActions: [
        {
          actions: [
            { action: UnitAction.View, allowed: true },
            { action: UnitAction.Edit, allowed: false },
            { action: UnitAction.Share, allowed: false },
          ],
        },
      ],
    });

    const viewerSubmit = await running.app.collabService.submitChangeset(
      {
        changeset: {
          unitID,
          type: UniverType.UNIVER_SHEET,
          baseRev: 1,
          revision: 2,
          sid: randomUUID(),
          reqId: 1,
          userID: "forged-user",
          memberID: "forged-member",
          mutations: [],
        },
      },
      {
        session: {
          memberId: "viewer-member",
          userId: "user-bob",
          customData: {},
        },
      }
    );
    expect(viewerSubmit).toMatchObject({
      status: "rejected",
      error: { code: "PERMISSION_DENIED" },
    });

    const history = await fetch(
      `${running.origin}/universer-api/history/${unitID}/list?length=20`,
      { headers: { cookie: bob.cookie } }
    );
    expect(history.status).toBe(200);
    await expect(history.json()).resolves.toMatchObject({
      historyIds: [`${unitID}:1`],
    });

    await running.app.close();
    applications.splice(applications.indexOf(running.app), 1);
    running = await start(filename);
    alice = await signIn(running.origin, "alice", "alice-password");
    bob = await signIn(running.origin, "bob", "bob-password");

    const persistedAccess = await fetch(
      `${running.origin}/api/units/${unitID}/access`,
      { headers: { cookie: bob.cookie } }
    );
    await expect(persistedAccess.json()).resolves.toEqual({ role: "viewer" });

    expect(
      (
        await grant(
          running.origin,
          bob.cookie,
          unitID,
          "user-alice",
          "editor"
        )
      ).status
    ).toBe(403);
    expect(
      (
        await grant(
          running.origin,
          alice.cookie,
          unitID,
          "user-bob",
          "editor"
        )
      ).status
    ).toBe(200);

    const editorSubmit = await running.app.collabService.submitChangeset(
      {
        changeset: {
          unitID,
          type: UniverType.UNIVER_SHEET,
          baseRev: 1,
          revision: 2,
          sid: randomUUID(),
          reqId: 2,
          userID: "forged-user",
          memberID: "forged-member",
          mutations: [],
        },
      },
      {
        session: {
          memberId: "editor-member",
          userId: "user-bob",
          customData: {},
        },
      }
    );
    expect(editorSubmit).toMatchObject({
      status: "committed",
      changeset: { revision: 2, userID: "user-bob" },
    });
  });
});

async function start(filename?: string): Promise<{
  readonly app: BasicSheetsAuthApplication;
  readonly origin: string;
}> {
  let databaseFilename = filename;
  if (!databaseFilename) {
    const directory = await mkdtemp(join(tmpdir(), "basic-sheets-auth-"));
    directories.push(directory);
    databaseFilename = join(directory, "demo.sqlite");
  }
  const app = await createBasicSheetsAuthApplication({
    databaseFilename,
    jwtSecret: "integration-test-secret",
    serveClient: false,
  });
  applications.push(app);
  const port = await app.listen(0);
  return { app, origin: `http://127.0.0.1:${port}` };
}

async function signIn(origin: string, username: string, password: string) {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  return {
    setCookie,
    cookie: setCookie.split(";", 1)[0] ?? "",
  };
}

function grant(
  origin: string,
  cookie: string,
  unitID: string,
  userId: string,
  role: "editor" | "viewer"
): Promise<Response> {
  return fetch(
    `${origin}/api/units/${unitID}/members/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }
  );
}
