import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UniverType } from "@univerjs/protocol";
import type { DemoApplication } from "../server/express-server.js";
import { createDemoApplication } from "../server/express-server.js";
import { LOGIN_COOKIE_NAME } from "../server/auth.js";

let demo: DemoApplication;
let origin: string;

beforeAll(async () => {
  demo = await createDemoApplication({
    jwtSecret: "integration-test-secret",
    serveClient: false,
  });
  const port = await demo.listen(0);
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await demo.close();
});

describe("JWT memory auth collaboration example", () => {
  it("rejects invalid credentials and unauthenticated collaboration HTTP", async () => {
    const invalid = await fetch(`${origin}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "wrong" }),
    });
    expect(invalid.status).toBe(401);

    const ticket = await fetch(
      `${origin}/universer-api/user/session-ticket`
    );
    expect(ticket.status).toBe(401);
    await expect(ticket.json()).resolves.toMatchObject({
      error: { message: "Authentication required" },
    });
  });

  it("uses an HttpOnly JWT cookie and exposes the authenticated user", async () => {
    const alice = await signIn("alice", "alice-password");
    expect(alice.setCookie).toContain(`${LOGIN_COOKIE_NAME}=`);
    expect(alice.setCookie).toContain("HttpOnly");
    expect(alice.setCookie).toContain("SameSite=Lax");

    const me = await fetch(`${origin}/api/me`, {
      headers: { cookie: alice.cookie },
    });
    expect(me.status).toBe(200);
    await expect(me.json()).resolves.toEqual({
      userId: "user-alice",
      username: "alice",
    });

    const unknownCollaborationRoute = await fetch(
      `${origin}/universer-api/unknown`,
      { headers: { cookie: alice.cookie } }
    );
    expect(unknownCollaborationRoute.status).toBe(404);
    await expect(unknownCollaborationRoute.text()).resolves.toBe("Not Found");
  });

  it("creates a real Sheet snapshot and enforces admin/editor/viewer ACL", async () => {
    const alice = await signIn("alice", "alice-password");
    const bob = await signIn("bob", "bob-password");
    const carol = await signIn("carol", "carol-password");

    const create = await fetch(`${origin}/api/units`, {
      method: "POST",
      headers: {
        cookie: alice.cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ name: "Integration Sheet" }),
    });
    expect(create.status).toBe(201);
    const created = await create.json() as {
      unitID: string;
      type: UniverType;
      role: string;
    };
    expect(created).toMatchObject({
      type: UniverType.UNIVER_SHEET,
      role: "admin",
    });

    const snapshot = await fetch(
      `${origin}/universer-api/snapshot/${UniverType.UNIVER_SHEET}/unit/${created.unitID}/rev/0`,
      { headers: { cookie: alice.cookie } }
    );
    expect(snapshot.status).toBe(200);
    await expect(snapshot.json()).resolves.toMatchObject({
      snapshot: {
        unitID: created.unitID,
        type: UniverType.UNIVER_SHEET,
        rev: 1,
      },
      changesets: [],
    });

    const bobBeforeGrant = await fetch(
      `${origin}/api/units/${created.unitID}/access`,
      { headers: { cookie: bob.cookie } }
    );
    expect(bobBeforeGrant.status).toBe(403);

    expect(
      await grant(alice.cookie, created.unitID, "user-bob", "editor")
    ).toBe(204);
    expect(
      await grant(alice.cookie, created.unitID, "user-carol", "viewer")
    ).toBe(204);

    const bobAccess = await fetch(
      `${origin}/api/units/${created.unitID}/access`,
      { headers: { cookie: bob.cookie } }
    );
    await expect(bobAccess.json()).resolves.toEqual({ role: "editor" });

    // UI read-only is not trusted: the Service itself rejects a viewer submit.
    const viewerSubmit = await demo.collabService.submitChangeset(
      {
        changeset: {
          unitID: created.unitID,
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
          userId: "user-carol",
          customData: {},
        },
      }
    );
    expect(viewerSubmit).toMatchObject({
      status: "rejected",
      error: { code: "PERMISSION_DENIED" },
    });

    expect(
      await grant(bob.cookie, created.unitID, "user-carol", "editor")
    ).toBe(403);
    expect(carol.cookie).toContain(`${LOGIN_COOKIE_NAME}=`);
  });

  it("issues a protocol-compatible one-time session ticket", async () => {
    const alice = await signIn("alice", "alice-password");
    const response = await fetch(
      `${origin}/universer-api/user/session-ticket`,
      { headers: { cookie: alice.cookie } }
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "" },
      ticket: expect.any(String),
    });
  });
});

async function signIn(username: string, password: string) {
  const response = await fetch(`${origin}/api/login`, {
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

async function grant(
  cookie: string,
  unitID: string,
  userId: string,
  role: "admin" | "editor" | "viewer"
): Promise<number> {
  const response = await fetch(
    `${origin}/api/units/${unitID}/members/${userId}`,
    {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }
  );
  return response.status;
}
