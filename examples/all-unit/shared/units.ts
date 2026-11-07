import type { UniverType } from "@univerjs/protocol";

export interface UnitSummary {
  readonly unitId: string;
  readonly type: UniverType;
  readonly name: string;
}

export interface UnitsResponse {
  readonly units: readonly UnitSummary[];
  readonly user: { userId: string; displayName: string };
}

/** Imported and converted Units are not in the fixed list, so their links also carry the type. */
export function unitLink(unitId: string, type: number) {
  return `/?unit=${encodeURIComponent(unitId)}&type=${type}`;
}
