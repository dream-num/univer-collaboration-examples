import { createHash } from "node:crypto";
import { UniverType, type IChangeset } from "@univerjs/protocol";
import { CollabError, type CollabSession } from "@univerjs/collaboration-service";
import type {
  IUniverCollabWorktreeService,
  WorktreeData,
} from "@univerjs/collaboration-worktree-service";
import type { UserStore } from "../auth.js";
import type {
  ProductStore,
  WorkspaceResource,
} from "../product-store.js";
import { createInitialUnit, isCreatableUnitType } from "../unit-data.js";
import type {
  CreateWorkspaceWorktreeInput,
  CreateWorkspaceWorktreeUnitInput,
  SubmitWorkspaceChangesetResult,
  UpdateWorkspaceWorktreeInput,
  WorkspaceWorktree,
  WorkspaceWorktreeUnit,
  WorkspaceWorktreeView,
} from "./model.js";
import {
  orchestrationCustomData,
} from "./orchestration.js";
import type {
  PendingWorkspaceWorktreeOperation,
  StagedResourceRecord,
  WorktreeCatalogRecord,
  WorkspaceWorktreeCatalog,
  WorkspaceWorktreeOperation,
} from "./worktree-catalog.js";
import {
  canDiscoverWorktree,
  canDiscardWorktree,
  canEditResource,
  canEditWorktree,
  canMergeWorktree,
  canReopenWorktree,
  isSpaceEditor,
} from "./worktree-policy.js";

export interface WorkspaceWorktreeApplication {
  list(input: {
    readonly actorUserID: string;
    readonly view: WorkspaceWorktreeView;
    readonly scope?: "user" | "space";
    readonly spaceID?: string;
    readonly creatorUserID?: string;
  }): Promise<readonly WorkspaceWorktree[]>;
  get(actorUserID: string, worktreeID: string): Promise<WorkspaceWorktree>;
  create(
    actorUserID: string,
    input: CreateWorkspaceWorktreeInput
  ): Promise<WorkspaceWorktree>;
  update(
    actorUserID: string,
    worktreeID: string,
    input: UpdateWorkspaceWorktreeInput
  ): Promise<WorkspaceWorktree>;
  addUnit(
    actorUserID: string,
    worktreeID: string,
    resourceID: string
  ): Promise<WorkspaceWorktree>;
  createUnit(
    actorUserID: string,
    worktreeID: string,
    input: CreateWorkspaceWorktreeUnitInput
  ): Promise<WorkspaceWorktree>;
  submitChangeset(
    actorUserID: string,
    worktreeID: string,
    unitID: string,
    changeset: IChangeset
  ): Promise<SubmitWorkspaceChangesetResult>;
  ready(actorUserID: string, worktreeID: string): Promise<WorkspaceWorktree>;
  reopen(actorUserID: string, worktreeID: string): Promise<WorkspaceWorktree>;
  merge(actorUserID: string, worktreeID: string): Promise<WorkspaceWorktree>;
  discard(actorUserID: string, worktreeID: string): Promise<WorkspaceWorktree>;
  reconcile(): Promise<void>;
}

export function createWorkspaceWorktreeApplication(input: {
  readonly catalog: WorkspaceWorktreeCatalog;
  readonly productStore: ProductStore;
  readonly userStore: UserStore;
  readonly service: IUniverCollabWorktreeService;
}): WorkspaceWorktreeApplication {
  const { catalog, productStore, userStore, service } = input;

  const session = (userID: string): CollabSession => ({
    memberId: `workspace-app-${userID}`,
    userId: userID,
    customData: Object.create(null) as Record<string, unknown>,
  });
  const options = (userID: string) => ({
    session: session(userID),
    customData: orchestrationCustomData() as Record<string, unknown>,
  });

  const requireCatalog = (worktreeID: string): WorktreeCatalogRecord => {
    const record = catalog.get(worktreeID);
    if (!record) {
      throw new CollabError("UNIT_NOT_FOUND", "Worktree does not exist");
    }
    return record;
  };

  const spaceRole = (record: WorktreeCatalogRecord, actorUserID: string) =>
    record.scope.kind === "space"
      ? productStore.getSpaceRole(record.scope.spaceID, actorUserID)
      : null;

  const requireDiscoverable = (
    actorUserID: string,
    worktreeID: string
  ): WorktreeCatalogRecord => {
    const record = requireCatalog(worktreeID);
    if (
      !canDiscoverWorktree(
        actorUserID,
        record,
        spaceRole(record, actorUserID)
      )
    ) {
      throw new CollabError("UNIT_NOT_FOUND", "Worktree does not exist");
    }
    return record;
  };

  const requireEditable = (
    actorUserID: string,
    worktreeID: string
  ): WorktreeCatalogRecord => {
    const record = requireDiscoverable(actorUserID, worktreeID);
    if (
      !canEditWorktree(actorUserID, record, spaceRole(record, actorUserID))
    ) {
      throw new CollabError("PERMISSION_DENIED", "Worktree is read-only");
    }
    return record;
  };

  const requireEditableResource = (
    actorUserID: string,
    resourceID: string
  ): WorkspaceResource => {
    const resource = productStore.getByID(resourceID);
    const role = resource
      ? productStore.getAccessRoleByID(resource.id, actorUserID)
      : null;
    if (
      !resource ||
      resource.status !== "active" ||
      !canEditResource(role)
    ) {
      throw new CollabError(
        resource && role ? "PERMISSION_DENIED" : "UNIT_NOT_FOUND",
        resource && role ? "Resource is read-only" : "Resource does not exist"
      );
    }
    return resource;
  };

  const validateAllEditable = (
    actorUserID: string,
    record: WorktreeCatalogRecord
  ): void => {
    for (const mapping of record.units) {
      if (mapping.source === "trunk") {
        requireEditableResource(actorUserID, mapping.resourceID);
        continue;
      }
      const staged = catalog.getStagedResource(mapping.resourceID);
      if (!staged || staged.status === "discarded") {
        throw new CollabError(
          "UNIT_NOT_FOUND",
          "Staged resource does not exist"
        );
      }
      const targetSpace = productStore.getSpace(staged.spaceID);
      const role = targetSpace
        ? productStore.getSpaceRole(staged.spaceID, actorUserID)
        : null;
      if (!targetSpace || !isSpaceEditor(role)) {
        throw new CollabError(
          "PERMISSION_DENIED",
          "Cannot create content in the target Space"
        );
      }
    }
  };

  const hydrate = async (
    actorUserID: string,
    record: WorktreeCatalogRecord,
    worktree?: WorktreeData
  ): Promise<WorkspaceWorktree> => {
    const aggregate =
      worktree ??
      (
        await service.getWorktree(
          { worktreeID: record.worktreeID },
          { session: session(actorUserID) }
        )
      ).worktree;
    const units = aggregate.units.map((unit): WorkspaceWorktreeUnit => {
      const mapping = record.units.find(
        (candidate) => candidate.unitID === unit.unitID
      );
      if (!mapping) {
        throw new CollabError(
          "INTERNAL_ERROR",
          "Worktree Catalog is missing a Unit mapping"
        );
      }
      const product =
        mapping.source === "trunk"
          ? productStore.getByID(mapping.resourceID)
          : null;
      const staged =
        mapping.source === "worktree"
          ? catalog.getStagedResource(mapping.resourceID)
          : null;
      if (!product && !staged) {
        throw new CollabError(
          "INTERNAL_ERROR",
          "Worktree Unit resource metadata is missing"
        );
      }
      return {
        unitID: unit.unitID,
        type: unit.type,
        source: unit.source,
        resourceID: mapping.resourceID,
        resourceStatus: product ? "active" : staged!.status,
        name: product?.name ?? staged!.name,
        spaceID: product?.spaceID ?? staged!.spaceID,
        parentID: product ? product.parentID : staged!.parentID,
        baselineTrunkRevision: unit.baselineTrunkRevision ?? null,
        draftHeadRevision: unit.draftHeadRevision,
        ...(unit.readyDraftHeadRevision === undefined
          ? {}
          : { readyDraftHeadRevision: unit.readyDraftHeadRevision }),
        ...(unit.mergeResult === undefined
          ? {}
          : { mergeResult: unit.mergeResult }),
      };
    });
    const creator = userStore.getById(record.creatorUserID);
    return {
      worktreeID: record.worktreeID,
      name: record.name,
      ...(record.summary === undefined ? {} : { summary: record.summary }),
      creatorUserID: record.creatorUserID,
      creatorName: creator?.name ?? record.creatorUserID,
      scope: record.scope,
      visibility: record.visibility,
      status: aggregate.status,
      units,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.processedAt === undefined
        ? {}
        : { processedAt: record.processedAt }),
    };
  };

  const resumeOperation = async (
    operation: PendingWorkspaceWorktreeOperation
  ): Promise<void> => {
    switch (operation.kind) {
      case "create-worktree": {
        let worktree: WorktreeData;
        try {
          worktree = (
            await service.createWorktree(
              {
                worktreeID: operation.worktree.worktreeID,
                units: operation.worktree.units.map(({ unitID }) => unitID),
              },
              options(operation.actorUserID)
            )
          ).worktree;
        } catch (error) {
          if (!hasErrorCode(error, "WORKTREE_ALREADY_EXISTS")) throw error;
          worktree = (
            await service.getWorktree(
              { worktreeID: operation.worktree.worktreeID },
              options(operation.actorUserID)
            )
          ).worktree;
        }
        assertRecoveredWorktree(operation, worktree);
        const existing = catalog.get(operation.worktree.worktreeID);
        if (existing) {
          assertSameCatalogWorktree(existing, operation.worktree);
        } else {
          catalog.create(operation.worktree);
        }
        break;
      }
      case "add-unit":
        await service.addUnit(
          {
            worktreeID: operation.unit.worktreeID,
            unitID: operation.unit.unitID,
          },
          options(operation.actorUserID)
        );
        catalog.addUnit(operation.unit);
        break;
      case "create-unit": {
        const staged = catalog.stageResource(operation.staged);
        if (!isCreatableUnitType(staged.type)) {
          throw new CollabError(
            "INTERNAL_ERROR",
            "Pending operation contains an unsupported Unit type"
          );
        }
        if (
          operation.initialData !== undefined &&
          staged.type !== UniverType.UNIVER_DOC
        ) {
          throw new CollabError(
            "INTERNAL_ERROR",
            "Pending initialData operation must create a Doc Unit"
          );
        }
        const initial = operation.initialData
          ? {
              kind: "data" as const,
              input: {
                type: UniverType.UNIVER_DOC as const,
                data: operation.initialData,
              },
            }
          : createInitialUnit(staged.type, staged.unitID, staged.name);
        if (initial.kind === "data") {
          await service.createUnitFromData(
            { worktreeID: staged.worktreeID, ...initial.input },
            options(operation.actorUserID)
          );
        } else {
          await service.createUnit(
            { worktreeID: staged.worktreeID, ...initial.input },
            options(operation.actorUserID)
          );
        }
        catalog.addUnit({
          worktreeID: staged.worktreeID,
          unitID: staged.unitID,
          resourceID: staged.resourceID,
          source: "worktree",
        });
        break;
      }
    }
    catalog.completeOperation(operation.operationID);
  };

  const runOperation = async (
    operation: PendingWorkspaceWorktreeOperation
  ): Promise<void> => {
    try {
      await resumeOperation(operation);
    } catch (error) {
      if (error instanceof CollabError && !error.retryable) {
        if (operation.kind === "create-unit") {
          catalog.removeStagedResource(operation.staged.resourceID);
        }
        catalog.completeOperation(operation.operationID);
      }
      throw error;
    }
  };

  return {
    async list(listInput) {
      const candidates = catalog.list(listInput);
      const visible = candidates.filter((record) =>
        canDiscoverWorktree(
          listInput.actorUserID,
          record,
          spaceRole(record, listInput.actorUserID)
        )
      );
      const results: WorkspaceWorktree[] = [];
      for (const record of visible) {
        results.push(await hydrate(listInput.actorUserID, record));
      }
      return results;
    },

    async get(actorUserID, worktreeID) {
      return hydrate(
        actorUserID,
        requireDiscoverable(actorUserID, worktreeID)
      );
    },

    async create(actorUserID, createInput) {
      const name = requiredName(createInput.name);
      const scope =
        createInput.scope.kind === "user"
          ? { kind: "user" as const, userID: actorUserID }
          : { kind: "space" as const, spaceID: createInput.scope.spaceID };
      const visibility = createInput.visibility ?? "private";
      const summary = createInput.summary?.trim() || undefined;
      const resourceIDs = createInput.resourceIDs ?? [];
      const existing = catalog.get(createInput.worktreeID);
      if (existing) {
        if (existing.creatorUserID !== actorUserID) {
          throw new CollabError("PERMISSION_DENIED", "Worktree ID is in use");
        }
        const existingResourceIDs = existing.units.map(
          ({ resourceID }) => resourceID
        );
        if (
          existing.name !== name ||
          existing.summary !== summary ||
          JSON.stringify(existing.scope) !== JSON.stringify(scope) ||
          existing.visibility !== visibility ||
          existingResourceIDs.length !== resourceIDs.length ||
          existingResourceIDs.some(
            (resourceID, index) => resourceID !== resourceIDs[index]
          )
        ) {
          throw new CollabError(
            "INVALID_REQUEST",
            "Worktree identity already uses different input"
          );
        }
        return hydrate(actorUserID, existing);
      }
      const resources = resourceIDs.map((resourceID) =>
        requireEditableResource(actorUserID, resourceID)
      );
      if (scope.kind === "user" && visibility !== "private") {
        throw new CollabError(
          "INVALID_REQUEST",
          "User Worktrees must be private"
        );
      }
      if (scope.kind === "space") {
        const target = productStore.getSpace(scope.spaceID);
        const role = target
          ? productStore.getSpaceRole(scope.spaceID, actorUserID)
          : null;
        if (!target || target.type !== "team" || !isSpaceEditor(role)) {
          throw new CollabError(
            target ? "PERMISSION_DENIED" : "UNIT_NOT_FOUND",
            "Team Space is unavailable"
          );
        }
        if (resources.some((resource) => resource.spaceID !== scope.spaceID)) {
          throw new CollabError(
            "INVALID_REQUEST",
            "Space Worktrees can only contain resources from that Space"
          );
        }
      }
      const operation = catalog.beginOperation({
        operationID: operationID(
          "create-worktree",
          createInput.worktreeID
        ),
        kind: "create-worktree",
        actorUserID,
        worktree: {
          worktreeID: createInput.worktreeID,
          name,
          ...(summary === undefined ? {} : { summary }),
          creatorUserID: actorUserID,
          scope,
          visibility,
          units: resources.map((resource) => ({
            unitID: resource.unitID,
            resourceID: resource.id,
            source: "trunk",
          })),
        },
      });
      await runOperation(operation);
      return hydrate(actorUserID, requireCatalog(createInput.worktreeID));
    },

    async update(actorUserID, worktreeID, updateInput) {
      const record = requireEditable(actorUserID, worktreeID);
      if (
        record.scope.kind === "user" &&
        updateInput.visibility !== undefined &&
        updateInput.visibility !== "private"
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "User Worktrees must be private"
        );
      }
      const updated = catalog.update(worktreeID, {
        ...(updateInput.name === undefined
          ? {}
          : { name: requiredName(updateInput.name) }),
        ...(updateInput.visibility === undefined
          ? {}
          : { visibility: updateInput.visibility }),
        ...(updateInput.summary === undefined
          ? {}
          : { summary: updateInput.summary?.trim() || null }),
      });
      return hydrate(actorUserID, updated!);
    },

    async addUnit(actorUserID, worktreeID, resourceID) {
      const record = requireEditable(actorUserID, worktreeID);
      const resource = requireEditableResource(actorUserID, resourceID);
      if (
        record.scope.kind === "space" &&
        resource.spaceID !== record.scope.spaceID
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "Resource is outside the Worktree Team Space"
        );
      }
      const operation = catalog.beginOperation({
        operationID: operationID("add-unit", worktreeID, resource.unitID),
        kind: "add-unit",
        actorUserID,
        unit: {
          worktreeID,
          unitID: resource.unitID,
          resourceID: resource.id,
          source: "trunk",
        },
      });
      await runOperation(operation);
      return hydrate(actorUserID, requireCatalog(worktreeID));
    },

    async createUnit(actorUserID, worktreeID, unitInput) {
      const record = requireEditable(actorUserID, worktreeID);
      if (!isCreatableUnitType(unitInput.type)) {
        throw new CollabError("INVALID_REQUEST", "Unsupported Unit type");
      }
      if (
        unitInput.initialData !== undefined &&
        unitInput.type !== UniverType.UNIVER_DOC
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "initialData currently supports Doc Units only"
        );
      }
      if (
        unitInput.initialData !== undefined &&
        (unitInput.initialData.id !== unitInput.unitID ||
          unitInput.initialData.rev !== 1)
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "initialData identity and initial revision must match the requested Unit"
        );
      }
      const initialDataFingerprint = fingerprintInitialData(
        unitInput.initialData
      );
      if (
        productStore.getByID(unitInput.resourceID) ||
        productStore.getByUnitID(unitInput.unitID)
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "Resource or Unit identity is already in use"
        );
      }
      const existingUnit = record.units.find(
        ({ unitID }) => unitID === unitInput.unitID
      );
      if (existingUnit) {
        const staged = catalog.getStagedResource(existingUnit.resourceID);
        if (
          existingUnit.source !== "worktree" ||
          existingUnit.resourceID !== unitInput.resourceID ||
          !staged ||
          staged.spaceID !== unitInput.spaceID ||
          staged.parentID !== (unitInput.parentID ?? null) ||
          staged.name !== requiredName(unitInput.name) ||
          staged.type !== unitInput.type ||
          staged.createdBy !== actorUserID ||
          staged.initialDataFingerprint !== initialDataFingerprint
        ) {
          throw new CollabError(
            "INVALID_REQUEST",
            "Unit identity already uses different input"
          );
        }
        return hydrate(actorUserID, record);
      }
      const target = productStore.getSpace(unitInput.spaceID);
      const role = target
        ? productStore.getSpaceRole(target.id, actorUserID)
        : null;
      if (!target || !isSpaceEditor(role)) {
        throw new CollabError(
          target ? "PERMISSION_DENIED" : "UNIT_NOT_FOUND",
          "Target Space is unavailable"
        );
      }
      if (
        record.scope.kind === "space" &&
        record.scope.spaceID !== target.id
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "New Unit must target the Worktree Team Space"
        );
      }
      const parentID = unitInput.parentID ?? null;
      if (parentID) {
        const parent = productStore.getFolder(parentID);
        if (
          !parent ||
          parent.spaceID !== target.id ||
          parent.status !== "active"
        ) {
          throw new CollabError("UNIT_NOT_FOUND", "Target folder is unavailable");
        }
      }
      const operationInput: WorkspaceWorktreeOperation = {
        operationID: operationID(
          "create-unit",
          worktreeID,
          unitInput.unitID
        ),
        kind: "create-unit",
        actorUserID,
        staged: {
          resourceID: unitInput.resourceID,
          worktreeID,
          unitID: unitInput.unitID,
          spaceID: target.id,
          parentID,
          name: requiredName(unitInput.name),
          type: unitInput.type,
          createdBy: actorUserID,
          ...(initialDataFingerprint === undefined
            ? {}
            : { initialDataFingerprint }),
        },
        ...(unitInput.initialData === undefined
          ? {}
          : { initialData: unitInput.initialData }),
      };
      const stagedIdentityExists =
        catalog.getStagedResource(unitInput.resourceID) !== null ||
        catalog.getStagedResourceByUnitID(unitInput.unitID) !== null;
      if (
        stagedIdentityExists &&
        catalog.getPendingOperation(operationInput.operationID) === null
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "Resource or Unit identity is already in use"
        );
      }
      let operation: PendingWorkspaceWorktreeOperation;
      try {
        operation = catalog.beginOperation(operationInput);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "Operation identity already uses different input"
        ) {
          throw new CollabError(
            "INVALID_REQUEST",
            "Unit identity already uses different input"
          );
        }
        throw error;
      }
      await runOperation(operation);
      return hydrate(actorUserID, requireCatalog(worktreeID));
    },

    async submitChangeset(
      actorUserID,
      worktreeID,
      unitID,
      changeset
    ) {
      const record = requireEditable(actorUserID, worktreeID);
      const mapping = record.units.find((unit) => unit.unitID === unitID);
      if (
        !mapping ||
        changeset.unitID !== unitID
      ) {
        throw new CollabError(
          "INVALID_REQUEST",
          "Path and changeset Unit must match"
        );
      }
      const current = await service.getWorktree(
        { worktreeID },
        { session: session(actorUserID) }
      );
      const unit = current.worktree.units.find(
        (candidate) => candidate.unitID === unitID
      );
      if (!unit || unit.type !== changeset.type) {
        throw new CollabError(
          "INVALID_REQUEST",
          "Changeset type does not match Worktree Unit"
        );
      }
      validateAllEditable(actorUserID, {
        ...record,
        units: [mapping],
      });
      const result = await service.submitChangeset(
        { worktreeID, changeset },
        options(actorUserID)
      );
      if (!("error" in result)) {
        return result;
      }
      return {
        status: result.status,
        error: {
          code: result.error.code,
          message: result.error.message,
          retryable: result.error.retryable,
          ...(result.error.details === undefined
            ? {}
            : { details: result.error.details }),
        },
      };
    },

    async ready(actorUserID, worktreeID) {
      const record = requireEditable(actorUserID, worktreeID);
      validateAllEditable(actorUserID, record);
      const result = await service.markReady(
        { worktreeID },
        options(actorUserID)
      );
      return hydrate(actorUserID, record, result.worktree);
    },

    async reopen(actorUserID, worktreeID) {
      const record = requireDiscoverable(actorUserID, worktreeID);
      if (
        !canReopenWorktree(
          actorUserID,
          record,
          spaceRole(record, actorUserID)
        )
      ) {
        throw new CollabError("PERMISSION_DENIED", "Cannot reopen Worktree");
      }
      const result = await service.reopenWorktree(
        { worktreeID },
        options(actorUserID)
      );
      return hydrate(actorUserID, record, result.worktree);
    },

    async merge(actorUserID, worktreeID) {
      const record = requireDiscoverable(actorUserID, worktreeID);
      if (
        !canMergeWorktree(
          actorUserID,
          record,
          spaceRole(record, actorUserID)
        )
      ) {
        throw new CollabError("PERMISSION_DENIED", "Cannot merge Worktree");
      }
      const result = await service.mergeWorktree(
        { worktreeID },
        options(actorUserID)
      );
      await activateMergedStagedResources(
        catalog,
        productStore,
        record,
        result.worktree
      );
      if (result.worktree.status === "merged") {
        catalog.markProcessed(worktreeID);
      }
      return hydrate(actorUserID, requireCatalog(worktreeID), result.worktree);
    },

    async discard(actorUserID, worktreeID) {
      const record = requireDiscoverable(actorUserID, worktreeID);
      if (
        !canDiscardWorktree(
          actorUserID,
          record,
          spaceRole(record, actorUserID)
        )
      ) {
        throw new CollabError("PERMISSION_DENIED", "Cannot discard Worktree");
      }
      const result = await service.discardWorktree(
        { worktreeID },
        options(actorUserID)
      );
      discardStagedResources(catalog, worktreeID);
      catalog.markProcessed(worktreeID);
      return hydrate(actorUserID, requireCatalog(worktreeID), result.worktree);
    },

    async reconcile() {
      for (const operation of catalog.listPendingOperations()) {
        try {
          await runOperation(operation);
        } catch {
          // A failed operation remains retryable or has been removed as terminal.
          // Either way, it must not prevent unrelated Worktrees from starting.
        }
      }
      const records = [
        ...catalog.listAll("active"),
        ...catalog.listAll("processed"),
      ];
      for (const record of records) {
        const aggregate = await service.getWorktree(
          { worktreeID: record.worktreeID },
          { session: session(record.creatorUserID) }
        );
        if (aggregate.worktree.status === "merged") {
          await activateMergedStagedResources(
            catalog,
            productStore,
            record,
            aggregate.worktree
          );
          catalog.markProcessed(record.worktreeID);
        } else if (aggregate.worktree.status === "discarded") {
          discardStagedResources(catalog, record.worktreeID);
          catalog.markProcessed(record.worktreeID);
        }
      }
    },
  };
}

async function activateMergedStagedResources(
  catalog: WorkspaceWorktreeCatalog,
  productStore: ProductStore,
  record: WorktreeCatalogRecord,
  worktree: WorktreeData
): Promise<void> {
  for (const unit of worktree.units) {
    if (
      unit.source !== "worktree" ||
      (unit.mergeResult?.status !== "merged" &&
        unit.mergeResult?.status !== "unchanged")
    ) {
      continue;
    }
    const mapping = record.units.find(
      (candidate) => candidate.unitID === unit.unitID
    );
    const staged = mapping
      ? catalog.getStagedResource(mapping.resourceID)
      : null;
    if (!staged || staged.status === "active") continue;
    try {
      productStore.activateStagedResource(stagedActivation(staged));
      catalog.setStagedStatus(staged.resourceID, "active");
    } catch {
      catalog.setStagedStatus(staged.resourceID, "activation-pending");
    }
  }
}

function discardStagedResources(
  catalog: WorkspaceWorktreeCatalog,
  worktreeID: string
): void {
  for (const staged of catalog.listStagedResources(worktreeID)) {
    if (staged.status !== "active") {
      catalog.setStagedStatus(staged.resourceID, "discarded");
    }
  }
}

function stagedActivation(staged: StagedResourceRecord) {
  return {
    resourceID: staged.resourceID,
    unitID: staged.unitID,
    spaceID: staged.spaceID,
    parentID: staged.parentID,
    name: staged.name,
    type: staged.type,
    createdBy: staged.createdBy,
  };
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name || name.length > 120) {
    throw new CollabError(
      "INVALID_REQUEST",
      "Name must contain 1-120 characters"
    );
  }
  return name;
}

type CreateWorktreeOperation = Extract<
  WorkspaceWorktreeOperation,
  { readonly kind: "create-worktree" }
>;

function assertRecoveredWorktree(
  operation: CreateWorktreeOperation,
  worktree: WorktreeData
): void {
  const expected = operation.worktree.units.map(({ unitID }) => unitID);
  const actual = worktree.units.map(({ unitID }) => unitID);
  if (
    worktree.status !== "draft" ||
    actual.length !== expected.length ||
    actual.some((unitID, index) => unitID !== expected[index]) ||
    worktree.units.some(({ source }) => source !== "trunk")
  ) {
    throw new CollabError(
      "INTERNAL_ERROR",
      "Pending Worktree create conflicts with stored collaboration data"
    );
  }
}

function assertSameCatalogWorktree(
  existing: WorktreeCatalogRecord,
  expected: CreateWorktreeOperation["worktree"]
): void {
  const unitsMatch =
    existing.units.length === expected.units.length &&
    existing.units.every((unit, index) => {
      const candidate = expected.units[index];
      return (
        candidate !== undefined &&
        unit.unitID === candidate.unitID &&
        unit.resourceID === candidate.resourceID &&
        unit.source === candidate.source
      );
    });
  if (
    existing.name !== expected.name ||
    existing.summary !== expected.summary ||
    existing.creatorUserID !== expected.creatorUserID ||
    JSON.stringify(existing.scope) !== JSON.stringify(expected.scope) ||
    existing.visibility !== expected.visibility ||
    !unitsMatch
  ) {
    throw new CollabError(
      "INTERNAL_ERROR",
      "Pending Worktree create conflicts with stored Catalog data"
    );
  }
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function operationID(
  kind: WorkspaceWorktreeOperation["kind"],
  ...identities: readonly string[]
): string {
  return `${kind}:${identities.join(":")}`;
}

function fingerprintInitialData(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest("hex");
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalizeJson(entry)])
  );
}
