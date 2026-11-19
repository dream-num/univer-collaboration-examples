import Database from "libsql";
import type { UnitSummary } from "../shared/units";

const SUMMARY_QUERY = `
  SELECT unit_id AS unitId, type,
    COALESCE(json_extract(metadata, '$.name'), unit_id) AS name,
    COALESCE(json_extract(metadata, '$.updatedAt'), created_at_ms) AS updatedAt
  FROM collaboration_units
  WHERE deleted_status IS NULL
`;

// The SDK owns all writes. This application query projects the metadata used by the sidebar.
export class UnitRepository {
  private readonly _database: Database.Database;
  private readonly _list: Database.Statement;
  private readonly _get: Database.Statement;

  constructor(filename: string) {
    this._database = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      this._list = this._database.prepare(`${SUMMARY_QUERY} ORDER BY created_at_ms DESC, unit_id ASC`);
      this._get = this._database.prepare(`${SUMMARY_QUERY} AND unit_id = ?`);
    } catch (error) {
      this._database.close();
      throw error;
    }
  }

  listUnits(): readonly UnitSummary[] {
    return (this._list.all() as UnitSummary[]).map(toSummary);
  }

  getUnitSummary(unitID: string): UnitSummary | null {
    const row = this._get.get(unitID) as UnitSummary | undefined;
    return row ? toSummary(row) : null;
  }

  dispose(): void {
    if (this._database.open) this._database.close();
  }
}

function toSummary({ unitId, type, name, updatedAt }: UnitSummary): UnitSummary {
  return { unitId, type, name, updatedAt };
}
