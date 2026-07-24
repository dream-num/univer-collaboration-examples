import { randomUUID } from "node:crypto";
import { CollabError } from "@univerjs/collaboration-service";
import {
  WorktreeError,
  type UniverCollabWorktreeService,
  type WorktreeData,
} from "@univerjs/collaboration-worktree-service";
import { json, Router } from "express";
import { DEMO_TRUNK_UNIT_ID } from "../../shared/demo.js";
import type { DemoUser } from "../demo-user.js";
import { demoCallOptions } from "../demo-session.js";
import type {
  WorktreeCatalog,
  WorktreeCatalogEntry,
} from "../worktree-catalog.js";

export interface WorktreeRouterDependencies {
  readonly catalog: WorktreeCatalog;
  readonly service: UniverCollabWorktreeService;
  readonly user: DemoUser;
}

export interface DemoWorktreeData extends WorktreeData {
  readonly name: string;
  readonly createdAt: number;
  readonly completedAt?: number;
}

export function createWorktreeRouter(
  dependencies: WorktreeRouterDependencies
): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    const unitID =
      typeof request.query.unitID === "string"
        ? request.query.unitID
        : undefined;
    const entries = dependencies.catalog.list(unitID);
    const worktrees = (
      await Promise.all(
        entries.map((entry) => hydrateEntry(dependencies, entry))
      )
    ).filter(
      (worktree): worktree is DemoWorktreeData => worktree !== null
    );
    response.status(200).json({ worktrees });
  });

  router.post(
    "/",
    json({ limit: "32kb" }),
    async (request, response) => {
      const body = parseCreateBody(request.body);
      if (
        body.unitIDs.length !== 1 ||
        body.unitIDs[0] !== DEMO_TRUNK_UNIT_ID
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "Demo Worktree 必须从固定主线表格创建"
        );
      }
      const worktreeID = randomUUID();
      const createdAt = Date.now();
      const { worktree } = await dependencies.service.createWorktree(
        { worktreeID, units: body.unitIDs },
        demoCallOptions(dependencies.user)
      );
      let entry: WorktreeCatalogEntry;
      try {
        entry = dependencies.catalog.create({
          worktreeID,
          name: body.name,
          unitIDs: body.unitIDs,
          createdAt,
        });
      } catch (error) {
        // Catalog 是发现入口；登记失败时尽量关闭刚创建的孤立 Worktree。
        await dependencies.service
          .discardWorktree(
            { worktreeID },
            demoCallOptions(dependencies.user)
          )
          .catch(() => undefined);
        throw error;
      }
      response.status(201).json({
        worktree: toDemoWorktree(entry, worktree),
      });
    }
  );

  router.get("/:worktreeID", async (request, response) => {
    const entry = dependencies.catalog.get(request.params.worktreeID);
    if (!entry) {
      response.status(404).json({
        error: {
          code: "WORKTREE_NOT_FOUND",
          message: "Worktree 不存在",
        },
      });
      return;
    }
    const worktree = await hydrateEntry(dependencies, entry);
    if (!worktree) {
      response.status(404).json({
        error: {
          code: "WORKTREE_NOT_FOUND",
          message: "Worktree 不存在",
        },
      });
      return;
    }
    response.status(200).json({ worktree });
  });

  return router;
}

async function hydrateEntry(
  dependencies: WorktreeRouterDependencies,
  entry: WorktreeCatalogEntry
): Promise<DemoWorktreeData | null> {
  try {
    const { worktree } = await dependencies.service.getWorktree(
      { worktreeID: entry.worktreeID },
      demoCallOptions(dependencies.user)
    );
    return toDemoWorktree(entry, worktree);
  } catch (error) {
    if (
      error instanceof WorktreeError &&
      error.code === "WORKTREE_NOT_FOUND"
    ) {
      return null;
    }
    throw error;
  }
}

function toDemoWorktree(
  entry: WorktreeCatalogEntry,
  worktree: WorktreeData
): DemoWorktreeData {
  return {
    ...worktree,
    name: entry.name,
    createdAt: entry.createdAt,
    ...(entry.completedAt === undefined
      ? {}
      : { completedAt: entry.completedAt }),
  };
}

function parseCreateBody(value: unknown): {
  readonly name: string;
  readonly unitIDs: readonly string[];
} {
  if (!value || typeof value !== "object") {
    throw new CollabError("INVALID_REQUEST", "请求体必须是对象");
  }
  const body = value as {
    readonly name?: unknown;
    readonly unitIDs?: unknown;
  };
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) {
    throw new CollabError("INVALID_REQUEST", "Worktree 名称不能为空");
  }
  if (
    !Array.isArray(body.unitIDs) ||
    body.unitIDs.some((unitID) => typeof unitID !== "string")
  ) {
    throw new CollabError("INVALID_REQUEST", "unitIDs 必须是字符串数组");
  }
  return { name, unitIDs: body.unitIDs as string[] };
}
