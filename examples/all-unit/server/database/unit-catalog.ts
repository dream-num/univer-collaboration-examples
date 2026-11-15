import Database from "libsql";
import type { UnitSummary } from "../../shared/units";

const SUMMARY_QUERY = `
  SELECT u.unit_id AS unitId, u.type,
    COALESCE(json_extract(u.metadata, '$.name'), u.unit_id) AS name,
    COALESCE(json_extract(u.metadata, '$.updatedAt'), head.created_at_ms, u.created_at_ms) AS updatedAt
  FROM collaboration_units u
  LEFT JOIN collaboration_changesets head ON head.unit_id = u.unit_id AND head.revision = u.head_revision
  WHERE u.deleted_status IS NULL
`;

// The SDK owns all writes. This application query projects the metadata used by the sidebar.
export class UnitCatalog {
  private readonly _database: Database.Database;
  private readonly _list: Database.Statement;
  private readonly _get: Database.Statement;

  constructor(filename: string) {
    this._database = new Database(filename, { readonly: true, fileMustExist: true });
    try {
      this._list = this._database.prepare(`${SUMMARY_QUERY} ORDER BY updatedAt DESC, u.unit_id`);
      this._get = this._database.prepare(`${SUMMARY_QUERY} AND u.unit_id = ?`);
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
