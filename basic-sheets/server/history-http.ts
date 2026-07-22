import { randomUUID } from "node:crypto";
import type {
  CollabSession,
  UniverCollabService,
} from "@univerjs/collaboration-service";
import { CollabError } from "@univerjs/collaboration-service";
import type {
  NodeHttpTransportContext,
  NodeTransportMiddleware,
} from "@univerjs/collaboration-transport-node";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import type { DemoStore, Guest, HistoryEntry } from "./demo-store.js";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export function createHistoryHttpMiddleware(
  service: UniverCollabService,
  store: DemoStore
): NodeTransportMiddleware {
  return async (context, next) => {
    if (context.kind !== "http") {
      await next();
      return;
    }
    const url = new URL(context.incomingMessage.url ?? "/", "http://localhost");
    const match = matchHistoryRoute(
      context.incomingMessage.method,
      url.pathname
    );
    if (!match) {
      await next();
      return;
    }

    const guest = requireGuest(context);
    const session = callerSession(guest);
    try {
      if (match.action === "list") {
        const length = clampInteger(url.searchParams.get("length"), 20, 1, 100);
        const beforeRevision = optionalPositiveInteger(
          url.searchParams.get("lastLabel")
        );
        const origin = optionalOrigin(url.searchParams.get("origin"));
        const { entries, hasMore } =
          origin === 2
            ? { entries: [], hasMore: false }
            : store.listHistory(match.unitID, {
                length,
                ...(beforeRevision === undefined ? {} : { beforeRevision }),
                userIds: url.searchParams.getAll("userIds").filter(Boolean),
              });
        const guests = store.listCreators(match.unitID);
        writeJson(context, 200, historyListResponse(entries, guests, hasMore));
        return;
      }

      if (match.action === "creators") {
        writeJson(context, 200, {
          error: OK_ERROR,
          creators: store.listCreators(match.unitID).map((creator) => ({
            userId: creator.guestId,
            name: creator.name,
            avatar: "",
            origins: [1],
          })),
        });
        return;
      }

      const startRevision = requiredPositiveInteger(
        url.searchParams.get("startRevision"),
        "startRevision"
      );
      const endRevision = requiredPositiveInteger(
        url.searchParams.get("endRevision"),
        "endRevision"
      );
      if (endRevision < startRevision) {
        throw invalidRequest("endRevision must not precede startRevision");
      }
      const result = await service.getChangesets(
        {
          unitID: match.unitID,
          type: UniverType.UNIVER_SHEET,
          from: startRevision - 1,
          to: endRevision,
        },
        { session }
      );
      const users = Object.fromEntries(
        store.listCreators(match.unitID).map((creator) => [
          creator.guestId,
          protocolUser(creator),
        ])
      );
      writeJson(context, 200, {
        error: OK_ERROR,
        changesets: result.changesets,
        users,
      });
    } catch (error) {
      const failure = historyFailure(error);
      writeJson(context, failure.status, {
        error: {
          code: failure.code,
          message: failure.message,
        },
      });
    }
  };
}

function historyFailure(error: unknown): {
  readonly status: number;
  readonly code: ErrorCode;
  readonly message: string;
} {
  if (!(error instanceof CollabError)) {
    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: "Internal server error",
    };
  }

  switch (error.code) {
    case "UNAUTHENTICATED":
      return {
        status: 401,
        code: ErrorCode.UNAUTHENTICATED,
        message: error.message,
      };
    case "INVALID_REQUEST":
    case "REVISION_MISMATCH":
    case "OT_CONFLICT":
      return {
        status: 400,
        code: ErrorCode.INVALID_ARGUMENT,
        message: error.message,
      };
    case "UNIT_NOT_FOUND":
      return {
        status: 404,
        code: ErrorCode.NOT_FOUND,
        message: error.message,
      };
    case "PERMISSION_DENIED":
      return {
        status: 403,
        code: ErrorCode.PERMISSION_DENIED,
        message: error.message,
      };
    case "ADAPTER_FAILURE":
      return {
        status: 503,
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message,
      };
    case "INTERNAL_ERROR":
      return {
        status: 500,
        code: ErrorCode.INTERNAL_ERROR,
        message: error.message,
      };
  }
}

function matchHistoryRoute(
  method: string | undefined,
  pathname: string
):
  | { readonly action: "list" | "creators" | "changesets"; readonly unitID: string }
  | null {
  if (method !== "GET") return null;
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== "universer-api" ||
    segments[1] !== "history"
  ) {
    return null;
  }
  let action: "list" | "creators" | "changesets";
  if (segments[3] === "list") action = "list";
  else if (segments[3] === "creators") action = "creators";
  else if (segments[3] === "cs") action = "changesets";
  else return null;
  return { action, unitID: decodeURIComponent(segments[2]!) };
}

function historyListResponse(
  entries: readonly HistoryEntry[],
  guests: readonly Guest[],
  hasMore: boolean
) {
  const datas = Object.fromEntries(
    entries.map((entry) => [
      `${entry.unitID}:${entry.revision}`,
      {
        unitId: entry.unitID,
        userId: entry.userId,
        userIds: [entry.userId],
        command: [...entry.commands],
        createTime: String(entry.createdAt),
        recoverTime:
          entry.restoredRevision === undefined ? "" : String(entry.createdAt),
        startRevision: entry.revision,
        endRevision: entry.revision,
        additionalFields:
          entry.restoredRevision === undefined
            ? undefined
            : JSON.stringify({ restoredRevision: entry.restoredRevision }),
        origin: 1,
        startRevCreateTime: entry.createdAt,
        endRevCreateTime: entry.createdAt,
      },
    ])
  );
  return {
    error: OK_ERROR,
    hasMore,
    lastLabel: entries.at(-1)?.revision.toString() ?? "",
    entities: {
      datas,
      users: Object.fromEntries(
        guests.map((guest) => [guest.guestId, protocolUser(guest)])
      ),
    },
    historyIds: entries.map((entry) => `${entry.unitID}:${entry.revision}`),
  };
}

function protocolUser(guest: Guest) {
  return {
    userID: guest.guestId,
    name: guest.name,
    avatar: "",
    anonymous: true,
    canBindAnonymous: false,
    phone: "",
    email: "",
    createTimestamp: guest.createdAt,
  };
}

function callerSession(guest: Guest): CollabSession {
  return {
    memberId: `http-${randomUUID()}`,
    userId: guest.guestId,
    customData: { guest },
  };
}

function requireGuest(context: NodeHttpTransportContext): Guest {
  const guest = context.customData.guest as Guest | undefined;
  if (!guest) {
    throw new CollabError(
      "UNAUTHENTICATED",
      "Anonymous guest identity is unavailable"
    );
  }
  return guest;
}

function writeJson(
  context: NodeHttpTransportContext,
  status: number,
  body: unknown
): void {
  context.response.statusCode = status;
  context.response.setHeader("content-type", "application/json; charset=utf-8");
  context.response.end(JSON.stringify(body));
}

function clampInteger(
  value: string | null,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function optionalPositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw invalidRequest("lastLabel must be a positive integer");
  }
  return parsed;
}

function requiredPositiveInteger(value: string | null, name: string): number {
  const parsed = Number(value);
  if (!value || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw invalidRequest(`${name} must be a positive integer`);
  }
  return parsed;
}

function optionalOrigin(value: string | null): 0 | 1 | 2 {
  if (value === null || value === "0") return 0;
  if (value === "1" || value === "2") return Number(value) as 1 | 2;
  throw invalidRequest("origin must be 0, 1 or 2");
}

function invalidRequest(message: string): CollabError {
  return new CollabError("INVALID_REQUEST", message);
}
