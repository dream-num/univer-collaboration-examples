import { UniverType, type IChangeset } from "@univerjs/protocol";
import type { IDocumentData } from "@univerjs/core";
import { CollabError } from "@univerjs/collaboration-service";
import { json, Router } from "express";
import type { AuthService } from "../auth.js";
import type {
  CreateWorkspaceWorktreeInput,
  CreateWorkspaceWorktreeUnitInput,
  UpdateWorkspaceWorktreeInput,
  WorkspaceWorktreeView,
} from "./model.js";
import type { WorkspaceWorktreeApplication } from "./worktree-application.js";

export function createWorkspaceWorktreeRouter(input: {
  readonly authService: AuthService;
  readonly application: WorkspaceWorktreeApplication;
}): Router {
  const router = Router();
  router.use(json({ limit: "10mb" }));
  router.use((request, response, next) => {
    response.locals.user = input.authService.requireUser(request);
    next();
  });

  router.get("/", async (request, response) => {
    const scope = scopeFilter(request.query.scope);
    const worktrees = await input.application.list({
      actorUserID: actorID(response),
      view: worktreeView(request.query.view),
      ...(scope === undefined ? {} : { scope }),
      ...(stringValue(request.query.spaceID)
        ? { spaceID: stringValue(request.query.spaceID) }
        : {}),
      ...(stringValue(request.query.creatorUserID)
        ? { creatorUserID: stringValue(request.query.creatorUserID) }
        : {}),
    });
    response.json({ worktrees });
  });

  router.post("/", async (request, response) => {
    const body = parseCreateBody(request.body);
    const worktree = await input.application.create(actorID(response), body);
    response.status(201).json({ worktree });
  });

  router.get("/:worktreeID", async (request, response) => {
    const worktree = await input.application.get(
      actorID(response),
      request.params.worktreeID
    );
    response.json({ worktree });
  });

  router.patch("/:worktreeID", async (request, response) => {
    const worktree = await input.application.update(
      actorID(response),
      request.params.worktreeID,
      parseUpdateBody(request.body)
    );
    response.json({ worktree });
  });

  router.post("/:worktreeID/units", async (request, response) => {
    const resourceID = requiredString(request.body?.resourceID, "resourceID");
    const worktree = await input.application.addUnit(
      actorID(response),
      request.params.worktreeID,
      resourceID
    );
    response.json({ worktree });
  });

  router.post("/:worktreeID/units/new", async (request, response) => {
    const worktree = await input.application.createUnit(
      actorID(response),
      request.params.worktreeID,
      parseCreateUnitBody(request.body)
    );
    response.status(201).json({ worktree });
  });

  router.post(
    "/:worktreeID/units/:unitID/submit_changesets",
    async (request, response) => {
      const changeset = parseChangeset(request.body?.changeset);
      const result = await input.application.submitChangeset(
        actorID(response),
        request.params.worktreeID,
        request.params.unitID,
        changeset
      );
      response.json(result);
    }
  );

  for (const action of [
    "ready",
    "reopen",
    "merge",
    "discard",
  ] as const) {
    router.post(`/:worktreeID/${action}`, async (request, response) => {
      const worktree = await input.application[action](
        actorID(response),
        request.params.worktreeID
      );
      response.json({ worktree });
    });
  }

  return router;
}

function parseCreateBody(value: unknown): CreateWorkspaceWorktreeInput {
  if (!isRecord(value) || !isRecord(value.scope)) {
    throw invalid("Invalid Worktree create body");
  }
  const kind = value.scope.kind;
  const scope =
    kind === "user"
      ? { kind: "user" as const }
      : kind === "space"
        ? {
            kind: "space" as const,
            spaceID: requiredString(value.scope.spaceID, "scope.spaceID"),
          }
        : null;
  if (!scope) throw invalid("scope.kind must be user or space");
  const visibility = value.visibility;
  if (
    visibility !== undefined &&
    visibility !== "private" &&
    visibility !== "space"
  ) {
    throw invalid("visibility must be private or space");
  }
  const resourceIDs = value.resourceIDs;
  if (
    resourceIDs !== undefined &&
    (!Array.isArray(resourceIDs) ||
      resourceIDs.some((resourceID) => typeof resourceID !== "string"))
  ) {
    throw invalid("resourceIDs must be a string array");
  }
  return {
    worktreeID: requiredString(value.worktreeID, "worktreeID"),
    name: requiredString(value.name, "name"),
    scope,
    ...(visibility === undefined ? {} : { visibility }),
    ...(resourceIDs === undefined
      ? {}
      : { resourceIDs: resourceIDs as string[] }),
    ...(typeof value.summary === "string" ? { summary: value.summary } : {}),
  };
}

function parseUpdateBody(value: unknown): UpdateWorkspaceWorktreeInput {
  if (!isRecord(value)) throw invalid("Invalid Worktree update body");
  const visibility = value.visibility;
  if (
    visibility !== undefined &&
    visibility !== "private" &&
    visibility !== "space"
  ) {
    throw invalid("visibility must be private or space");
  }
  if (
    value.summary !== undefined &&
    value.summary !== null &&
    typeof value.summary !== "string"
  ) {
    throw invalid("summary must be a string or null");
  }
  return {
    ...(value.name === undefined
      ? {}
      : { name: requiredString(value.name, "name") }),
    ...(visibility === undefined ? {} : { visibility }),
    ...(value.summary === undefined
      ? {}
      : { summary: value.summary as string | null }),
  };
}

function parseCreateUnitBody(
  value: unknown
): CreateWorkspaceWorktreeUnitInput {
  if (!isRecord(value)) throw invalid("Invalid Unit create body");
  if (!Number.isSafeInteger(value.type)) {
    throw invalid("type must be an integer");
  }
  const unitID = requiredString(value.unitID, "unitID");
  const type = value.type as CreateWorkspaceWorktreeUnitInput["type"];
  const initialData = parseInitialDocumentData(value.initialData, unitID, type);
  return {
    resourceID: requiredString(value.resourceID, "resourceID"),
    unitID,
    spaceID: requiredString(value.spaceID, "spaceID"),
    ...(value.parentID === undefined || value.parentID === null
      ? { parentID: null }
      : { parentID: requiredString(value.parentID, "parentID") }),
    name: requiredString(value.name, "name"),
    type,
    ...(initialData === undefined ? {} : { initialData }),
  };
}

function parseInitialDocumentData(
  value: unknown,
  unitID: string,
  type: CreateWorkspaceWorktreeUnitInput["type"]
): IDocumentData | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalid("initialData must be an object");
  if (type !== UniverType.UNIVER_DOC) {
    throw invalid("initialData currently supports Doc Units only");
  }
  if (value.id !== unitID) {
    throw invalid("initialData.id must match unitID");
  }
  if (value.rev !== 1) {
    throw invalid("initialData.rev must be 1");
  }
  return value as unknown as IDocumentData;
}

function parseChangeset(value: unknown): IChangeset {
  if (
    !isRecord(value) ||
    typeof value.unitID !== "string" ||
    !Number.isSafeInteger(value.type) ||
    !Number.isSafeInteger(value.baseRev) ||
    typeof value.sid !== "string" ||
    !Number.isSafeInteger(value.reqId) ||
    !Array.isArray(value.mutations)
  ) {
    throw invalid("Invalid changeset");
  }
  return value as unknown as IChangeset;
}

function actorID(response: { locals: { user?: unknown } }): string {
  const user = response.locals.user as { readonly userId?: unknown };
  if (typeof user?.userId !== "string") {
    throw new CollabError("UNAUTHENTICATED", "Please log in");
  }
  return user.userId;
}

function worktreeView(value: unknown): WorkspaceWorktreeView {
  return value === "processed" ? "processed" : "active";
}

function scopeFilter(value: unknown): "user" | "space" | undefined {
  if (value === undefined) return undefined;
  if (value === "user" || value === "space") return value;
  throw invalid("scope must be user or space");
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requiredString(value: unknown, name: string): string {
  const result = stringValue(value);
  if (!result) throw invalid(`${name} is required`);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function invalid(message: string): CollabError {
  return new CollabError("INVALID_REQUEST", message);
}
