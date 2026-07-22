import { createRequire } from "node:module";
import {
  deserializeToCombResponse,
  serializeCombRequest,
} from "@univerjs-pro/collaboration-client";
import type { DatabaseContext } from "@univerjs/collaboration-service";
import type { IChangeset, ISheetBlock } from "@univerjs/protocol";
import { CmdRspCode, CombCmd, UniverType } from "@univerjs/protocol";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DemoApplication } from "../server/express-server.js";
import { createDemoApplication } from "../server/express-server.js";

const sdkRequire = createRequire(import.meta.url);
const { transformSnapshotToWorkbookData } = sdkRequire(
  "@univerjs-pro/collaboration"
) as typeof import("@univerjs-pro/collaboration");

let demo: DemoApplication;
let origin: string;

beforeAll(async () => {
  demo = await createDemoApplication({
    jwtSecret: "e2e-test-secret",
    serveClient: false,
  });
  const port = await demo.listen(0);
  origin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await demo.close();
});

describe("JWT sample full collaboration flow", () => {
  it("converges concurrent editors, catches up after disconnect and rejects a viewer", async () => {
    const aliceAuth = await signIn("alice", "alice-password");
    const bobAuth = await signIn("bob", "bob-password");
    const carolAuth = await signIn("carol", "carol-password");
    const unitID = await createUnit(aliceAuth.cookie);
    expect(await grant(aliceAuth.cookie, unitID, "user-bob", "editor")).toBe(204);
    expect(await grant(aliceAuth.cookie, unitID, "user-carol", "viewer")).toBe(204);

    const clients: CombTestClient[] = [];
    try {
      let alice = await connectComb(aliceAuth.cookie);
      clients.push(alice);
      expect((await alice.join(unitID)).code).toBe(CmdRspCode.OK);

      const bob = await connectComb(bobAuth.cookie);
      clients.push(bob);
      const aliceSeesBob = alice.next();
      expect((await bob.join(unitID)).code).toBe(CmdRspCode.OK);
      expect(eventID(await aliceSeesBob)).toBe("users_enter");

      const aliceEvents = alice.take(2);
      const bobEvents = bob.take(2);
      const [aliceSubmit, bobSubmit] = await Promise.all([
        postChanges(
          aliceAuth.cookie,
          alice.memberID,
          changeset(unitID, 1, "alice-sid", 0, "alice")
        ),
        postChanges(
          bobAuth.cookie,
          bob.memberID,
          changeset(unitID, 1, "bob-sid", 1, "bob")
        ),
      ]);
      expect([aliceSubmit.status, bobSubmit.status]).toEqual([200, 200]);

      assertConvergedRealtimePair(await aliceEvents);
      assertConvergedRealtimePair(await bobEvents);
      const initialCatchUp = await fetchMissing(
        aliceAuth.cookie,
        unitID,
        1
      );
      expect(initialCatchUp.latestRevision).toBe(3);
      expect(initialCatchUp.changesets.map((item) => item.revision)).toEqual([
        2,
        3,
      ]);

      const bobSeesAliceLeave = bob.next();
      await alice.close();
      expect(eventID(await bobSeesAliceLeave)).toBe("users_leave");

      const bobAck = bob.next();
      expect(
        (
          await postChanges(
            bobAuth.cookie,
            bob.memberID,
            changeset(unitID, 3, "bob-sid", 2, "while-alice-offline", 2)
          )
        ).status
      ).toBe(200);
      expect(eventID(await bobAck)).toBe("changeset_ack");

      alice = await connectComb(aliceAuth.cookie);
      clients.push(alice);
      const bobSeesAliceReturn = bob.next();
      expect((await alice.join(unitID)).code).toBe(CmdRspCode.OK);
      expect(eventID(await bobSeesAliceReturn)).toBe("users_enter");

      const missed = await fetchMissing(aliceAuth.cookie, unitID, 3);
      expect(missed.latestRevision).toBe(4);
      expect(missed.changesets).toHaveLength(1);
      expect(missed.changesets[0]).toMatchObject({
        revision: 4,
        sid: "bob-sid",
        reqId: 2,
      });

      const carol = await connectComb(carolAuth.cookie);
      clients.push(carol);
      const aliceSeesCarol = alice.next();
      const bobSeesCarol = bob.next();
      expect((await carol.join(unitID)).code).toBe(CmdRspCode.OK);
      expect(eventID(await aliceSeesCarol)).toBe("users_enter");
      expect(eventID(await bobSeesCarol)).toBe("users_enter");

      const viewerRejection = carol.next();
      expect(
        (
          await postChanges(
            carolAuth.cookie,
            carol.memberID,
            changeset(unitID, 4, "carol-sid", 3, "forged-viewer-write")
          )
        ).status
      ).toBe(200);
      expect(eventID(await viewerRejection)).toBe("permission_rej");
      expect((await fetchMissing(carolAuth.cookie, unitID, 4)).changesets).toEqual([]);

      const aliceSeesCarolLeave = alice.next();
      const bobSeesCarolLeave = bob.next();
      await carol.close();
      expect(eventID(await aliceSeesCarolLeave)).toBe("users_leave");
      expect(eventID(await bobSeesCarolLeave)).toBe("users_leave");

      // Revision 5 triggers the default synchronous Sheet snapshot policy.
      const aliceAck = alice.next();
      const bobBroadcast = bob.next();
      expect(
        (
          await postChanges(
            aliceAuth.cookie,
            alice.memberID,
            changeset(unitID, 4, "alice-sid", 3, "snapshot-at-five", 2)
          )
        ).status
      ).toBe(200);
      expect(eventID(await aliceAck)).toBe("changeset_ack");
      expect(eventID(await bobBroadcast)).toBe("new_changesets");

      const workbook = await readLatestWorkbook(unitID);
      const sheet = workbook.sheets["sheet-1"];
      expect(sheet).toBeDefined();
      expect(sheet!.cellData?.[0]?.[0]?.v).toBe("alice");
      expect(sheet!.cellData?.[0]?.[1]?.v).toBe("bob");
      expect(sheet!.cellData?.[0]?.[2]?.v).toBe(
        "while-alice-offline"
      );
      expect(sheet!.cellData?.[0]?.[3]?.v).toBe(
        "snapshot-at-five"
      );
    } finally {
      await Promise.allSettled(clients.map((client) => client.close()));
    }
  }, 15_000);
});

class CombTestClient {
  private readonly _messages: unknown[] = [];
  private readonly _waiters: Array<{
    readonly resolve: (message: any) => void;
    readonly reject: (error: Error) => void;
    readonly timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(
    private readonly _socket: WebSocket,
    readonly memberID: string
  ) {
    _socket.addEventListener("message", (event) => {
      const message = deserializeToCombResponse({
        data: String(event.data),
      } as never);
      const waiter = this._waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this._messages.push(message);
      }
    });
    _socket.addEventListener("close", () => {
      for (const waiter of this._waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error("WebSocket closed before the expected message"));
      }
    });
  }

  next(): Promise<any> {
    const queued = this._messages.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this._waiters.findIndex((item) => item.timer === timer);
        if (index >= 0) this._waiters.splice(index, 1);
        reject(new Error("Timed out waiting for a Comb message"));
      }, 5_000);
      this._waiters.push({ resolve, reject, timer });
    });
  }

  take(count: number): Promise<any[]> {
    return Promise.all(Array.from({ length: count }, () => this.next()));
  }

  request(message: object): Promise<any> {
    const response = this.next();
    this._socket.send(serializeCombRequest(message as never));
    return response;
  }

  join(unitID: string): Promise<any> {
    return this.request({
      cmd: CombCmd.JOIN,
      routeKey: unitID,
      routeType: "",
      data: { rooms: [{ roomID: unitID }] },
    });
  }

  close(): Promise<void> {
    if (this._socket.readyState === WebSocket.CLOSED) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this._socket.addEventListener("close", () => resolve(), { once: true });
      if (this._socket.readyState === WebSocket.OPEN) this._socket.close();
    });
  }
}

async function connectComb(cookie: string): Promise<CombTestClient> {
  const ticketResponse = await fetch(
    `${origin}/universer-api/user/session-ticket`,
    { headers: { cookie } }
  );
  expect(ticketResponse.status).toBe(200);
  const { ticket } = await ticketResponse.json() as { ticket: string };
  const socket = new WebSocket(
    `${origin.replace(/^http/, "ws")}/universer-api/comb/connect?sessionTicket=${ticket}`
  );
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener(
      "error",
      () => reject(new Error("WebSocket connection failed")),
      { once: true }
    );
  });

  const helloRaw = await requestSocket(socket, {
    cmd: CombCmd.HELLO,
    routeKey: "",
    routeType: "",
  });
  const memberID = helloRaw.data.memberID as string;
  expect(helloRaw.code).toBe(CmdRspCode.OK);
  expect(memberID).toEqual(expect.any(String));
  return new CombTestClient(socket, memberID);
}

function requestSocket(socket: WebSocket, message: object): Promise<any> {
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      cleanup();
      resolve(deserializeToCombResponse({ data: String(event.data) } as never));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("WebSocket closed before its response"));
    };
    const cleanup = () => {
      socket.removeEventListener("message", onMessage);
      socket.removeEventListener("close", onClose);
    };
    socket.addEventListener("message", onMessage, { once: true });
    socket.addEventListener("close", onClose, { once: true });
    socket.send(serializeCombRequest(message as never));
  });
}

function changeset(
  unitID: string,
  baseRev: number,
  sid: string,
  column: number,
  value: string,
  reqId = 1
): IChangeset {
  return {
    unitID,
    type: UniverType.UNIVER_SHEET,
    baseRev,
    revision: 999,
    userID: "forged-user",
    memberID: "forged-member",
    sid,
    reqId,
    mutations: [
      {
        id: "sheet.mutation.set-range-values",
        data: JSON.stringify({
          unitId: unitID,
          subUnitId: "sheet-1",
          cellValue: { 0: { [column]: { v: value } } },
        }),
      },
    ],
  };
}

async function postChanges(
  cookie: string,
  memberID: string,
  submitted: IChangeset
): Promise<Response> {
  return fetch(
    `${origin}/universer-api/comb/${submitted.type}/unit/${submitted.unitID}/new_changes`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        unitID: submitted.unitID,
        memberID,
        type: submitted.type,
        changeset: submitted,
      }),
    }
  );
}

async function fetchMissing(cookie: string, unitID: string, from: number) {
  const response = await fetch(
    `${origin}/universer-api/snapshot/${UniverType.UNIVER_SHEET}/unit/${unitID}/fetchmissing?from=${from}&to=0`,
    { headers: { cookie } }
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    readonly latestRevision: number;
    readonly changesets: readonly IChangeset[];
  }>;
}

function assertConvergedRealtimePair(messages: readonly any[]): void {
  expect(messages.map(eventID).sort()).toEqual([
    "changeset_ack",
    "new_changesets",
  ]);
  expect(
    messages.map((message) => message.data.data.revision).sort((a, b) => a - b)
  ).toEqual([2, 3]);
}

function eventID(message: any): string {
  return message.data.eventID as string;
}

async function readLatestWorkbook(unitID: string) {
  const context: DatabaseContext = {
    session: {
      memberId: "e2e-inspector",
      userId: "user-alice",
      customData: {},
    },
    request: { customData: {} },
  };
  const snapshot = await demo.database.getSnapshot(context, unitID, {
    revision: 0,
  });
  expect(snapshot).toMatchObject({ unitID, rev: 5 });
  const blockIDs = Object.values(snapshot?.workbook?.blockMeta ?? {}).flatMap(
    (meta) => meta.blocks
  );
  const blocks = (
    await Promise.all(
      blockIDs.map((blockID) =>
        demo.database.getSheetBlock(context, unitID, blockID)
      )
    )
  ).filter((block): block is ISheetBlock => block !== null);
  expect(blocks).toHaveLength(blockIDs.length);
  return transformSnapshotToWorkbookData(snapshot!, blocks);
}

async function signIn(username: string, password: string) {
  const response = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { cookie: setCookie.split(";", 1)[0] ?? "" };
}

async function createUnit(cookie: string): Promise<string> {
  const response = await fetch(`${origin}/api/units`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Full-stack E2E" }),
  });
  expect(response.status).toBe(201);
  return ((await response.json()) as { unitID: string }).unitID;
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
