import { randomUUID } from "node:crypto";
import type {
  CollabSession,
  UniverCollabService,
} from "@univerjs/collaboration-service";
import { CollabError } from "@univerjs/collaboration-service";
import { Router } from "express";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import type { DemoUser } from "../demo-user.js";
import { protocolUser } from "../demo-user.js";
import type { HistoryEntry, HistoryStore } from "../history-store.js";

const OK_ERROR = { code: ErrorCode.OK, message: "" };

export interface HistoryRouterDependencies {
  readonly collabService: UniverCollabService;
  readonly historyStore: HistoryStore;
  readonly user: DemoUser;
}

/** History 是产品能力，因此由应用层 Express Router 实现。 */
export function createHistoryRouter(
  dependencies: HistoryRouterDependencies
): Router {
  const router = Router();
  const { collabService, historyStore, user } = dependencies;

  router.get("/:unitID/list", (request, response) => {
    const url = requestUrl(request.originalUrl);
    const length = clampInteger(url.searchParams.get("length"), 20, 1, 100);
    const beforeRevision = optionalPositiveInteger(
      url.searchParams.get("lastLabel")
    );
    const origin = optionalOrigin(url.searchParams.get("origin"));
    const { entries, hasMore } =
      origin === 2
        ? { entries: [], hasMore: false }
        : historyStore.listHistory(request.params.unitID, {
            length,
            ...(beforeRevision === undefined ? {} : { beforeRevision }),
            userIds: url.searchParams.getAll("userIds").filter(Boolean),
          });
    response.status(200).json(historyListResponse(entries, user, hasMore));
  });

  router.get("/:unitID/creators", (_request, response) => {
    response.status(200).json({
      error: OK_ERROR,
      creators: [
        {
          userId: user.userId,
          name: user.name,
          avatar: "",
          origins: [1],
        },
      ],
    });
  });

  router.get("/:unitID/cs", async (request, response) => {
    const url = requestUrl(request.originalUrl);
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
    const result = await collabService.getChangesets(
      {
        unitID: request.params.unitID,
        type: UniverType.UNIVER_SHEET,
        from: startRevision - 1,
        to: endRevision,
      },
      { session: callerSession(user) }
    );
    response.status(200).json({
      error: OK_ERROR,
      changesets: result.changesets,
      users: { [user.userId]: protocolUser(user) },
    });
  });

  return router;
}

function historyListResponse(
  entries: readonly HistoryEntry[],
  user: DemoUser,
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
      users: { [user.userId]: protocolUser(user) },
    },
    historyIds: entries.map((entry) => `${entry.unitID}:${entry.revision}`),
  };
}

function callerSession(user: DemoUser): CollabSession {
  return {
    memberId: `http-${randomUUID()}`,
    userId: user.userId,
    customData: { user },
  };
}

function requestUrl(originalUrl: string): URL {
  return new URL(originalUrl, "http://localhost");
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
