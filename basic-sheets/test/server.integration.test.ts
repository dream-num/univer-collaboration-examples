import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  createBasicSheetsApplication,
  type BasicSheetsApplication,
} from "../server/application.js";

interface ProtocolUserResponse {
  readonly user: { readonly userID: string; readonly name: string };
}

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
  it("keeps signed guest identity, units and history across a restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "univer-basic-sheets-"));
    directories.push(directory);
    const filename = join(directory, "demo.sqlite");
    let running = await start(filename);

    const first = await getUser(running.origin);
    expect(first.cookie).toContain("univer_basic_guest=");
    expect(first.setCookie).toContain("HttpOnly");
    expect(first.setCookie).toContain("SameSite=Lax");
    expect(first.user.name).toMatch(/^Guest [0-9A-F]{4}$/);

    const repeated = await getUser(running.origin, first.cookie);
    expect(repeated.user).toEqual(first.user);
    expect(repeated.setCookie).toBe("");

    const second = await getUser(running.origin);
    expect(second.user.userID).not.toBe(first.user.userID);

    const tampered = tamperCookie(first.cookie);
    const replacement = await getUser(running.origin, tampered);
    expect(replacement.user.userID).not.toBe(first.user.userID);
    expect(replacement.setCookie).toContain("univer_basic_guest=");

    const createResponse = await fetch(
      `${running.origin}/universer-api/snapshot/2/unit/-/create`,
      {
        method: "POST",
        headers: { cookie: first.cookie, "content-type": "application/json" },
        body: JSON.stringify({ name: "Persistent demo" }),
      }
    );
    expect(createResponse.status).toBe(201);
    const { unitID } = (await createResponse.json()) as {
      readonly unitID: string;
    };

    const snapshot = await protocolJson(
      `${running.origin}/universer-api/snapshot/2/unit/${unitID}/rev/1`,
      first.cookie
    );
    expect(snapshot.response.status).toBe(200);
    expect(snapshot.body.snapshot).toMatchObject({ unitID, rev: 1, type: 2 });

    const history = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list?length=20`,
      first.cookie
    );
    expect(history.response.status).toBe(200);
    expect(history.body.historyIds).toEqual([`${unitID}:1`]);
    const creatorFilter = encodeURIComponent(first.user.userID);
    const filteredHistory = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list?userIds=${creatorFilter}`,
      first.cookie
    );
    expect(filteredHistory.body.historyIds).toEqual([`${unitID}:1`]);
    const unrelatedHistory = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list?userIds=someone-else`,
      first.cookie
    );
    expect(unrelatedHistory.body.historyIds).toEqual([]);

    const permissionResponse = await fetch(
      `${running.origin}/universer-api/authz/-/object/-/batch_allowed`,
      {
        method: "POST",
        headers: { cookie: first.cookie, "content-type": "application/json" },
        body: JSON.stringify({
          requests: [
            { unitID, objectID: unitID, objectType: 1, actions: [1, 2] },
          ],
        }),
      }
    );
    expect(permissionResponse.status).toBe(200);
    expect(await permissionResponse.json()).toMatchObject({
      objectActions: [
        {
          unitID,
          objectID: unitID,
          actions: [{ allowed: true }, { allowed: true }],
        },
      ],
    });

    const invalid = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/cs?startRevision=x&endRevision=1`,
      first.cookie
    );
    expect(invalid.response.status).toBe(400);
    const invalidOrigin = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list?origin=invalid`,
      first.cookie
    );
    expect(invalidOrigin.response.status).toBe(400);
    const invalidLastLabel = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list?lastLabel=invalid`,
      first.cookie
    );
    expect(invalidLastLabel.response.status).toBe(400);

    await running.app.close();
    applications.splice(applications.indexOf(running.app), 1);
    running = await start(filename);

    expect((await getUser(running.origin, first.cookie)).user).toEqual(first.user);
    const persistedSnapshot = await protocolJson(
      `${running.origin}/universer-api/snapshot/2/unit/${unitID}/rev/1`,
      first.cookie
    );
    expect(persistedSnapshot.response.status).toBe(200);
    expect(persistedSnapshot.body.snapshot).toMatchObject({ unitID, rev: 1 });
    const persistedHistory = await protocolJson(
      `${running.origin}/universer-api/history/${unitID}/list`,
      first.cookie
    );
    expect(persistedHistory.body.historyIds).toEqual([`${unitID}:1`]);

    const missing = await protocolJson(
      `${running.origin}/universer-api/history/missing-unit/cs?startRevision=1&endRevision=1`,
      first.cookie
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

async function getUser(origin: string, cookie?: string): Promise<{
  readonly cookie: string;
  readonly setCookie: string;
  readonly user: ProtocolUserResponse["user"];
}> {
  const response = await fetch(`${origin}/universer-api/user`, {
    headers: cookie ? { cookie } : {},
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as ProtocolUserResponse;
  const setCookie = response.headers.get("set-cookie") ?? "";
  return {
    cookie: setCookie ? setCookie.split(";", 1)[0]! : cookie ?? "",
    setCookie,
    user: body.user,
  };
}

async function protocolJson(url: string, cookie: string) {
  const response = await fetch(url, { headers: { cookie } });
  return { response, body: (await response.json()) as any };
}

function tamperCookie(cookie: string): string {
  const last = cookie.at(-1);
  return `${cookie.slice(0, -1)}${last === "A" ? "B" : "A"}`;
}
