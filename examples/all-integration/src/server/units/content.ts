import { randomUUID } from "node:crypto";
import { getBoardsEmptySnapshot } from "@univerjs-pro/boards";
import { getSlidesEmptySnapshot } from "@univerjs-pro/slides";
import {
  UnitSnapshotMaterializer,
  UniverCollabService,
  type CreateUnitFromSnapshotInput,
} from "@univerjs-pro/collaboration-service";
import {
  getBasesEmptySnapshot,
  getDocsEmptySnapshot,
  LocaleType,
} from "@univerjs/core";
import { UniverType } from "@univerjs/protocol";
import { createCollabContext } from "../collaboration/context";
import type { UnitRepository } from "./units.repository";

const supportedTypes = new Set<UniverType>([
  UniverType.UNIVER_SHEET,
  UniverType.UNIVER_DOC,
  UniverType.UNIVER_SLIDE,
  UniverType.UNIVER_BOARD,
  UniverType.UNIVER_BASE,
]);

export function isSupportedUnitType(value: unknown): value is UniverType {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    supportedTypes.has(value as UniverType)
  );
}

export function createUnitOperations(options: {
  service: UniverCollabService;
  repository: UnitRepository;
}) {
  const { service, repository } = options;

  async function createUnit(input: {
    type: UniverType;
    name: string;
    creatorUserId: string;
  }) {
    const unitId = randomUUID();
    repository.beginCreate({
      unitId,
      type: input.type,
      name: input.name,
      creatorUserId: input.creatorUserId,
    });

    try {
      switch (input.type) {
        case UniverType.UNIVER_SHEET:
          await service.createUnitFromData(
            {
              type: UniverType.UNIVER_SHEET,
              data: {
                id: unitId,
                rev: 1,
                name: input.name,
                appVersion: "",
                locale: LocaleType.EN_US,
                sheetOrder: ["sheet-1"],
                sheets: {
                  "sheet-1": {
                    id: "sheet-1",
                    name: "Sheet 1",
                    rowCount: 100,
                    columnCount: 26,
                    cellData: {},
                  },
                },
                styles: {},
                resources: [],
              },
            },
            createCollabContext(input.creatorUserId),
          );
          break;
        case UniverType.UNIVER_DOC:
          await service.createUnitFromData(
            {
              type: UniverType.UNIVER_DOC,
              data: {
                ...getDocsEmptySnapshot(unitId),
                rev: 1,
                title: input.name,
              },
            },
            createCollabContext(input.creatorUserId),
          );
          break;
        case UniverType.UNIVER_SLIDE:
          await service.createUnitFromData(
            {
              type: UniverType.UNIVER_SLIDE,
              data: {
                ...getSlidesEmptySnapshot(
                  unitId,
                  LocaleType.EN_US,
                  input.name,
                ),
                rev: 1,
              },
            },
            createCollabContext(input.creatorUserId),
          );
          break;
        case UniverType.UNIVER_BOARD:
          await service.createUnitFromData(
            {
              type: UniverType.UNIVER_BOARD,
              data: {
                ...getBoardsEmptySnapshot(unitId, input.name),
                rev: 1,
              },
            },
            createCollabContext(input.creatorUserId),
          );
          break;
        case UniverType.UNIVER_BASE:
          await service.createUnitFromData(
            {
              type: UniverType.UNIVER_BASE,
              data: {
                ...getBasesEmptySnapshot(unitId),
                rev: 1,
                name: input.name,
              },
            },
            createCollabContext(input.creatorUserId),
          );
          break;
      }
      repository.finishCreate(unitId);
      return repository.getUnit(input.creatorUserId, unitId)!;
    } catch (error) {
      repository.abortCreate(unitId);
      throw error;
    }
  }

  async function importUnit(input: {
    unitId: string;
    type: UniverType;
    name: string;
    creatorUserId: string;
    data: CreateUnitFromSnapshotInput;
  }) {
    repository.beginCreate({
      unitId: input.unitId,
      type: input.type,
      name: input.name,
      creatorUserId: input.creatorUserId,
    });
    try {
      await service.createUnitFromSnapshot(
        input.data,
        createCollabContext(input.creatorUserId),
      );
      repository.finishCreate(input.unitId);
      return repository.getUnit(input.creatorUserId, input.unitId)!;
    } catch (error) {
      repository.abortCreate(input.unitId);
      throw error;
    }
  }

  async function captureSnapshot(input: {
    userId: string;
    unitId: string;
    type: UniverType;
  }) {
    const loadData = await service.getUnitLoadDataWithBlocks(
      { unitID: input.unitId, type: input.type, revision: 0 },
      createCollabContext(input.userId),
    );
    const materializer = new UnitSnapshotMaterializer();
    try {
      return await materializer.materializeSnapshot(loadData);
    } finally {
      await materializer.dispose();
    }
  }

  return { createUnit, importUnit, captureSnapshot };
}
