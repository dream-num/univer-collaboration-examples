import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBasicSheetsApplication,
  type BasicSheetsApplication,
} from "../server/application.js";

const applications: BasicSheetsApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  await Promise.allSettled(applications.splice(0).map((app) => app.close()));
  await Promise.allSettled(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("basic-sheets server integration", () => {
  it("serves the fixed user and persists units and history", async () => {
    const directory = await mkdtemp(join(tmpdir(), "univer-basic-sheets-"));
    directories.push(directory);
    const filename = join(directory, "demo.sqlite");
    let running = await start(filename);

    const user = await getUser(running.origin);
    expect(user).toMatchObject({ userID: "demo-user", name: "Demo User" });

    const createResponse = await fetch(
      `${running.origin}/universer-api/snapshot/2/unit/-/create`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Persistent demo" }),
      }
    );
    expect(createResponse.status).toBe(201);
    const { unitID } = (await createResponse.json()) as {
      readonly unitID: string;
    };

    const snapshot = await protocolJson(
      `${running.origin}/universer-api/snapshot/2/unit/${unitID}/rev/1`
    );
    expect(snapshot.response.status).toBe(200);
    expect(snapshot.body.snapshot).toMatchObject({ unitID, rev: 1, type: 2 });

    const history = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list?length=20`
    );
    expect(history.body.historyIds).toEqual([`${unitID}:1`]);
    expect(history.body.entities.users["demo-user"]).toMatchObject(user);

    const permissionResponse = await fetch(
      `${running.origin}/universer-api/authz/-/object/-/batch_allowed`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          requests: [
            { unitID, objectID: unitID, objectType: 1, actions: [1, 2] },
          ],
        }),
      }
    );
    expect(await permissionResponse.json()).toMatchObject({
      objectActions: [
        {
          unitID,
          objectID: unitID,
          actions: [{ allowed: true }, { allowed: true }],
        },
      ],
    });

    await running.app.close();
    applications.splice(applications.indexOf(running.app), 1);
    running = await start(filename);

    expect(await getUser(running.origin)).toEqual(user);
    const persistedSnapshot = await protocolJson(
      `${running.origin}/universer-api/snapshot/2/unit/${unitID}/rev/1`
    );
    expect(persistedSnapshot.body.snapshot).toMatchObject({ unitID, rev: 1 });
    const persistedHistory = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list`
    );
    expect(persistedHistory.body.historyIds).toEqual([`${unitID}:1`]);

    const invalid = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/cs?startRevision=x&endRevision=1`
    );
    expect(invalid.response.status).toBe(400);
    const missing = await protocolJson(
      `${running.origin}/universer-api/history/missing-unit/cs?startRevision=1&endRevision=1`
    );
    expect(missing.response.status).toBe(404);
  });
});

async function start(filename: string): Promise<{
  readonly app: BasicSheetsApplication;
  readonly origin: string;
}> {
  const app = await createBasicSheetsApplication({
    databaseFilename: filename,
    serveClient: false,
  });
  applications.push(app);
  const port = await app.listen(0);
  return { app, origin: `http://127.0.0.1:${port}` };
}

async function getUser(origin: string) {
  const response = await fetch(`${origin}/universer-api/user`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    readonly user: { readonly userID: string; readonly name: string };
  };
  expect(response.headers.get("set-cookie")).toBeNull();
  return body.user;
}

async function protocolJson(url: string) {
  const response = await fetch(url);
  return { response, body: (await response.json()) as any };
}
