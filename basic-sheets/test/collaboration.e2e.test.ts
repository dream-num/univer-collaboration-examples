import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deserializeToCombResponse,
  serializeCombRequest,
} from "@univerjs-pro/collaboration-client";
import type { DatabaseContext } from "@univerjs/collaboration-service";
import type { IChangeset, ISheetBlock } from "@univerjs/protocol";
import { CmdRspCode, CombCmd, UniverType } from "@univerjs/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createBasicSheetsApplication,
  type BasicSheetsApplication,
} from "../server/application.js";

const sdkRequire = createRequire(import.meta.url);
const { transformSnapshotToWorkbookData } = sdkRequire(
  "@univerjs-pro/collaboration"
) as typeof import("@univerjs-pro/collaboration");

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

describe("basic-sheets collaboration protocol", () => {
  it("converges guests, catches up, persists and restores as a new revision", async () => {
    const directory = await mkdtemp(join(tmpdir(), "univer-basic-e2e-"));
    directories.push(directory);
    const filename = join(directory, "demo.sqlite");
    let running = await start(filename);
    const firstGuest = await getGuest(running.origin);
    const secondGuest = await getGuest(running.origin);
    const unitID = await createUnit(running.origin, firstGuest.cookie);

    const clients: CombTestClient[] = [];
    try {
      let first = await connectComb(running.origin, firstGuest.cookie);
      clients.push(first);
      const firstJoin = await first.join(unitID);
      expect(firstJoin.code).toBe(CmdRspCode.OK);
      expect(firstJoin.data.roomInfos[unitID].members[0]).toMatchObject({
        userID: firstGuest.userID,
        name: firstGuest.name,
      });

      const second = await connectComb(running.origin, secondGuest.cookie);
      clients.push(second);
      const firstSeesSecond = first.next();
      const secondJoin = await second.join(unitID);
      expect(secondJoin.code).toBe(CmdRspCode.OK);
      expect(secondJoin.data.roomInfos[unitID].members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            userID: firstGuest.userID,
            name: firstGuest.name,
          }),
          expect.objectContaining({
            userID: secondGuest.userID,
            name: secondGuest.name,
          }),
        ])
      );
      expect(eventID(await firstSeesSecond)).toBe("users_enter");

      const firstEvents = first.take(2);
      const secondEvents = second.take(2);
      const [firstSubmit, secondSubmit] = await Promise.all([
        postChanges(
          running.origin,
          firstGuest.cookie,
          first.memberID,
          cellChangeset(unitID, 1, "first", 0, "one", 1)
        ),
        postChanges(
          running.origin,
          secondGuest.cookie,
          second.memberID,
          cellChangeset(unitID, 1, "second", 1, "two", 1)
        ),
      ]);
      expect([firstSubmit.status, secondSubmit.status]).toEqual([200, 200]);
      assertRealtimePair(await firstEvents);
      assertRealtimePair(await secondEvents);

      const secondPresence = second.next();
      first.sendPresence(unitID, "A1");
      expect(await secondPresence).toMatchObject({
        data: {
          eventID: "update_cursor",
          data: { unitID, memberID: first.memberID, selection: "A1" },
        },
      });

      const secondSeesLeave = second.next();
      await first.close();
      expect(eventID(await secondSeesLeave)).toBe("users_leave");

      const secondAck = second.next();
      expect(
        (
          await postChanges(
            running.origin,
            secondGuest.cookie,
            second.memberID,
            cellChangeset(unitID, 3, "second", 2, "offline", 2)
          )
        ).status
      ).toBe(200);
      expect(eventID(await secondAck)).toBe("changeset_ack");

      first = await connectComb(running.origin, firstGuest.cookie);
      clients.push(first);
      const secondSeesReturn = second.next();
      expect((await first.join(unitID)).code).toBe(CmdRspCode.OK);
      expect(eventID(await secondSeesReturn)).toBe("users_enter");

      const missed = await fetchMissing(
        running.origin,
        firstGuest.cookie,
        unitID,
        3
      );
      expect(missed.latestRevision).toBe(4);
      expect(missed.changesets).toHaveLength(1);
      expect(missed.changesets[0]).toMatchObject({ revision: 4, reqId: 2 });

      const firstAck = first.next();
      const secondBroadcast = second.next();
      expect(
        (
          await postChanges(
            running.origin,
            firstGuest.cookie,
            first.memberID,
            cellChangeset(unitID, 4, "first", 3, "snapshot", 2)
          )
        ).status
      ).toBe(200);
      expect(eventID(await firstAck)).toBe("changeset_ack");
      expect(eventID(await secondBroadcast)).toBe("new_changesets");

      const beforeRestart = await readLatestWorkbook(running.app, unitID, 5);
      expect(beforeRestart.sheets["sheet-1"]!.cellData?.[0]).toMatchObject({
        0: { v: "one" },
        1: { v: "two" },
        2: { v: "offline" },
        3: { v: "snapshot" },
      });

      await Promise.allSettled(clients.splice(0).map((client) => client.close()));
      await running.app.close();
      applications.splice(applications.indexOf(running.app), 1);
      running = await start(filename);

      expect((await getGuest(running.origin, firstGuest.cookie)).userID).toBe(
        firstGuest.userID
      );
      const persisted = await readLatestWorkbook(running.app, unitID, 5);
      expect(persisted.sheets["sheet-1"]!.cellData?.[0]?.[3]?.v).toBe("snapshot");

      const restoredClient = await connectComb(
        running.origin,
        firstGuest.cookie
      );
      clients.push(restoredClient);
      expect((await restoredClient.join(unitID)).code).toBe(CmdRspCode.OK);
      const restoreAck = restoredClient.next();
      const restoreResponse = await postChanges(
        running.origin,
        firstGuest.cookie,
        restoredClient.memberID,
        restoreChangeset(unitID, 5, "first", 3, 1)
      );
      expect(restoreResponse.status).toBe(200);
      expect(await restoreAck).toMatchObject({
        data: { eventID: "changeset_ack", data: { revision: 6 } },
      });

      const restored = await readLatestWorkbook(running.app, unitID, 6);
      expect(restored.sheets["sheet-1"]!.cellData ?? {}).toEqual({});
      await vi.waitFor(async () => {
        const history = await getHistory(
          running.origin,
          firstGuest.cookie,
          unitID
        );
        expect(history.historyIds.slice(0, 2)).toEqual([
          `${unitID}:6`,
          `${unitID}:5`,
        ]);
        expect(history.entities.datas[`${unitID}:6`].additionalFields).toContain(
          '"restoredRevision":1'
        );
      });

      await Promise.allSettled(clients.splice(0).map((client) => client.close()));
      await running.app.close();
      applications.splice(applications.indexOf(running.app), 1);
      running = await start(filename);
      const restoredAfterRestart = await readLatestWorkbook(
        running.app,
        unitID,
        6
      );
      expect(restoredAfterRestart.sheets["sheet-1"]!.cellData ?? {}).toEqual({});
    } finally {
      await Promise.allSettled(clients.map((client) => client.close()));
    }
  }, 30_000);
});

class CombTestClient {
  private readonly _messages: any[] = [];
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
        const index = this._waiters.findIndex((waiter) => waiter.timer === timer);
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

  sendPresence(unitID: string, selection: string): void {
    this._socket.send(
      serializeCombRequest({
        cmd: CombCmd.INGEST,
        routeKey: unitID,
        routeType: "",
        data: {
          eventID: "update_cursor",
          data: { unitID, memberID: this.memberID, selection },
        },
      } as never)
    );
  }

  close(): Promise<void> {
    if (this._socket.readyState === WebSocket.CLOSED) return Promise.resolve();
    return new Promise((resolve) => {
      this._socket.addEventListener("close", () => resolve(), { once: true });
      if (this._socket.readyState === WebSocket.OPEN) this._socket.close();
    });
  }
}

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

async function getGuest(origin: string, cookie?: string): Promise<{
  readonly cookie: string;
  readonly userID: string;
  readonly name: string;
}> {
  const response = await fetch(`${origin}/universer-api/user`, {
    headers: cookie ? { cookie } : {},
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    readonly user: { readonly userID: string; readonly name: string };
  };
  const setCookie = response.headers.get("set-cookie");
  return {
    cookie: setCookie?.split(";", 1)[0] ?? cookie ?? "",
    ...body.user,
  };
}

async function createUnit(origin: string, cookie: string): Promise<string> {
  const response = await fetch(
    `${origin}/universer-api/snapshot/2/unit/-/create`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Protocol E2E" }),
    }
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as { readonly unitID: string }).unitID;
}

async function connectComb(
  origin: string,
  cookie: string
): Promise<CombTestClient> {
  const ticketResponse = await fetch(
    `${origin}/universer-api/user/session-ticket`,
    { headers: { cookie } }
  );
  expect(ticketResponse.status).toBe(200);
  const { ticket } = (await ticketResponse.json()) as { readonly ticket: string };
  const socket = new WebSocket(
    `${origin.replace(/^http/, "ws")}/universer-api/comb/connect?sessionTicket=${ticket}`
  );
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("WebSocket failed")), {
      once: true,
    });
  });
  const hello = await requestSocket(socket, {
    cmd: CombCmd.HELLO,
    routeKey: "",
    routeType: "",
  });
  expect(hello.code).toBe(CmdRspCode.OK);
  return new CombTestClient(socket, hello.data.memberID as string);
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

function cellChangeset(
  unitID: string,
  baseRev: number,
  sid: string,
  column: number,
  value: string,
  reqId: number
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

function restoreChangeset(
  unitID: string,
  baseRev: number,
  sid: string,
  reqId: number,
  targetRevision: number
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
        id: "univer.mutation.revert-version",
        data: JSON.stringify({ unitId: unitID, revision: targetRevision }),
      },
    ],
  };
}

async function postChanges(
  origin: string,
  cookie: string,
  memberID: string,
  changeset: IChangeset
): Promise<Response> {
  return fetch(
    `${origin}/universer-api/comb/${changeset.type}/unit/${changeset.unitID}/new_changes`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        unitID: changeset.unitID,
        memberID,
        type: changeset.type,
        changeset,
      }),
    }
  );
}

async function fetchMissing(
  origin: string,
  cookie: string,
  unitID: string,
  from: number
) {
  const response = await fetch(
    `${origin}/universer-api/snapshot/2/unit/${unitID}/fetchmissing?from=${from}&to=0`,
    { headers: { cookie } }
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    readonly latestRevision: number;
    readonly changesets: readonly IChangeset[];
  }>;
}

async function getHistory(origin: string, cookie: string, unitID: string) {
  const response = await fetch(
    `${origin}/universer-api/history/${unitID}/list?length=20`,
    { headers: { cookie } }
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<any>;
}

function eventID(message: any): string {
  return message.data.eventID as string;
}

function assertRealtimePair(messages: readonly any[]): void {
  expect(messages.map(eventID).sort()).toEqual([
    "changeset_ack",
    "new_changesets",
  ]);
  expect(
    messages.map((message) => message.data.data.revision).sort((a, b) => a - b)
  ).toEqual([2, 3]);
}

async function readLatestWorkbook(
  app: BasicSheetsApplication,
  unitID: string,
  expectedRevision: number
) {
  const context: DatabaseContext = {
    session: { memberId: "inspector", userId: "inspector", customData: {} },
    request: { customData: {} },
  };
  const snapshot = await app.database.getSnapshot(context, unitID, { revision: 0 });
  expect(snapshot).toMatchObject({ unitID, rev: expectedRevision });
  const blockIDs = Object.values(snapshot?.workbook?.blockMeta ?? {}).flatMap(
    (metadata) => metadata.blocks
  );
  const blocks = (
    await Promise.all(
      blockIDs.map((blockID) => app.database.getSheetBlock(context, unitID, blockID))
    )
  ).filter((block): block is ISheetBlock => block !== null);
  return transformSnapshotToWorkbookData(snapshot!, blocks);
}
