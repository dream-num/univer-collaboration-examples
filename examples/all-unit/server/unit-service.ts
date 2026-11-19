import { randomUUID } from "node:crypto";
import type { IUniverCollabService } from "@univerjs-pro/collaboration-service";
import type { CreateUnitInput, UnitSummary } from "../shared/units";
import type { UnitRepository } from "./unit-repository";
import { initialData } from "./units";

export class UnitService {
  constructor(
    private readonly collabService: IUniverCollabService,
    private readonly repository: UnitRepository,
  ) {}

  listUnits(): readonly UnitSummary[] {
    return this.repository.listUnits();
  }

  async createUnit({ type, name }: CreateUnitInput, userID: string): Promise<UnitSummary | null> {
    const unitId = randomUUID();
    const result = await this.collabService.createUnitFromData({
      ...initialData({ unitId, type, name }), metadata: { name },
    }, { userID });
    if (result.status !== "created") return null;
    return this.repository.getUnitSummary(result.unitID);
  }
}
