import { randomUUID } from "node:crypto";
import type { IUniverCollabService } from "@univerjs-pro/collaboration-service";
import { UniverType } from "@univerjs/protocol";
import { createUnitData } from "./unit-data.js";
import type { UnitRepository } from "./unit-repository.js";

export class UnitService {
  constructor(
    private readonly collabService: IUniverCollabService,
    private readonly repository: UnitRepository,
  ) {}

  listUnits() {
    return this.repository.listUnits();
  }

  async createUnit(name: string, userID: string) {
    const result = await this.collabService.createUnitFromData({
      type: UniverType.UNIVER_SHEET,
      data: createUnitData(randomUUID(), name),
      metadata: { name },
    }, { userID });
    if (result.status !== "created") return null;
    return this.repository.getUnitSummary(result.unitID);
  }
}
