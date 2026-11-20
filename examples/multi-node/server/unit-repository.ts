import { UniverType } from "@univerjs/protocol";
import type { Pool } from "pg";
import type { UnitSummary } from "../shared/units.js";

const summaryQuery = `
  SELECT unit_id AS "unitID", COALESCE(metadata->>'name', unit_id) AS name
  FROM collaboration.units
  WHERE deleted_status IS NULL AND type = $1
`;

export class UnitRepository {
  constructor(private readonly pool: Pool) {}

  async listUnits(): Promise<UnitSummary[]> {
    const { rows } = await this.pool.query<UnitSummary>(
      `${summaryQuery} ORDER BY created_at_ms DESC, unit_id`, [UniverType.UNIVER_SHEET],
    );
    return rows;
  }

  async getUnitSummary(unitID: string): Promise<UnitSummary | null> {
    const { rows } = await this.pool.query<UnitSummary>(
      `${summaryQuery} AND unit_id = $2`, [UniverType.UNIVER_SHEET, unitID],
    );
    return rows[0] ?? null;
  }
}
