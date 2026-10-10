import type { UniverCollabService } from "@univerjs-pro/collaboration-service";
import type { UniverType } from "@univerjs/protocol";
import type { AppUnit } from "../../shared/api-types";
import { createCollabContext } from "../collaboration/context";
import { isSupportedUnitType } from "./content";
import type { UnitRepository } from "./units.repository";

export class UnitError extends Error {
  constructor(
    readonly code:
      | "UNIT_NOT_FOUND"
      | "INVALID_UNIT_NAME"
      | "INVALID_UNIT_TYPE"
      | "PERMISSION_DENIED",
    readonly status: number,
  ) {
    super(code);
  }
}

interface UnitsServiceOptions {
  readonly repository: UnitRepository;
  readonly collabService: Pick<
    UniverCollabService,
    "deleteUnits" | "recoverUnits"
  >;
  createUnit(input: {
    type: UniverType;
    name: string;
    creatorUserId: string;
  }): Promise<AppUnit>;
  invalidateUnitSessions(input: {
    unitID: string;
    userID?: string;
  }): Promise<void>;
}

function validateName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > 120)
    throw new UnitError("INVALID_UNIT_NAME", 400);
  return name;
}

export function createUnitsService(options: UnitsServiceOptions) {
  const { repository, collabService, createUnit, invalidateUnitSessions } =
    options;

  return {
    list(userId: string, scope: unknown) {
      if (scope === "trash") return repository.listTrash(userId);
      const units = repository.listUnits(userId);
      if (scope === "created")
        return units.filter((unit) => unit.role === "creator");
      return scope === "shared"
        ? units.filter((unit) => unit.role !== "creator")
        : units;
    },

    get(userId: string, unitId: string) {
      const unit = repository.getUnit(userId, unitId);
      if (!unit || unit.state !== "active")
        throw new UnitError("UNIT_NOT_FOUND", 404);
      return unit;
    },

    async create(userId: string, input: { type?: unknown; name?: unknown }) {
      if (!isSupportedUnitType(input.type))
        throw new UnitError("INVALID_UNIT_TYPE", 400);
      return createUnit({
        type: input.type,
        name: validateName(input.name),
        creatorUserId: userId,
      });
    },

    rename(userId: string, unitId: string, value: unknown) {
      const name = validateName(value);
      if (!repository.renameUnit(unitId, userId, name))
        throw new UnitError("PERMISSION_DENIED", 403);
      return repository.getUnit(userId, unitId);
    },

    async remove(userId: string, unitId: string) {
      if (!repository.beginDelete(unitId, userId))
        throw new UnitError("UNIT_NOT_FOUND", 404);
      try {
        await collabService.deleteUnits(
          { unitIDs: [unitId], hardDelete: false },
          createCollabContext(userId),
        );
        repository.finishDelete(unitId);
        await invalidateUnitSessions({ unitID: unitId });
      } catch (error) {
        repository.rollbackDelete(unitId);
        throw error;
      }
    },

    async recover(userId: string, unitId: string) {
      if (!repository.beginRecover(unitId, userId))
        throw new UnitError("UNIT_NOT_FOUND", 404);
      try {
        await collabService.recoverUnits(
          { unitIDs: [unitId] },
          createCollabContext(userId),
        );
        repository.finishRecover(unitId);
        return repository.getUnit(userId, unitId);
      } catch (error) {
        repository.rollbackRecover(unitId);
        throw error;
      }
    },

  };
}

export type UnitsService = ReturnType<typeof createUnitsService>;
