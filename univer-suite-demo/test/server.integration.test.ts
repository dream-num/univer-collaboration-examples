import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SuiteApplication } from "../server/application.js";
import { createSuiteApplication } from "../server/application.js";
import { UniverType } from "@univerjs/protocol";
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

      const restored = await json<{
        resource: { status: string };
      }>(
        `${origin}/api/units/${created.body.resource.id}/restore`,
        { method: "POST", headers: { cookie } }
      );
      expect(restored.body.resource.status).toBe("active");
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
