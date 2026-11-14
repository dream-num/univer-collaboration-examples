import Database from "libsql";
import type { UnitSummary } from "../../shared/units";

const SUMMARY_COLUMNS = `
  unit_id AS unitId, type, created_at_ms AS createdAt,
  json_extract(metadata, '$.name') AS name,
  json_extract(metadata, '$.origin') AS origin
`;

// The SDK owns all writes. This application query projects the metadata used by the sidebar.
export class UnitCatalog {
  private readonly _database: Database.Database;
  private readonly _list: Database.Statement;
  private readonly _get: Database.Statement;

  constructor(filename: string) {
    this._database = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      this._list = this._database.prepare(`
        SELECT ${SUMMARY_COLUMNS} FROM collaboration_units
        WHERE deleted_status IS NULL
        ORDER BY created_at_ms DESC, unit_id
      `);
      this._get = this._database.prepare(`
        SELECT ${SUMMARY_COLUMNS} FROM collaboration_units
        WHERE unit_id = ? AND deleted_status IS NULL
      `);
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

function toSummary({ unitId, type, name, origin, createdAt }: UnitSummary): UnitSummary {
  return { unitId, type, name, origin, createdAt };
}
