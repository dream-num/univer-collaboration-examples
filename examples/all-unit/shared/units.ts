import { UniverType } from "@univerjs/protocol";

export const UNIT_TYPES = [
  { type: UniverType.UNIVER_SHEET, label: "Sheet", defaultName: "Untitled sheet" },
  { type: UniverType.UNIVER_DOC, label: "Doc", defaultName: "Untitled document" },
  { type: UniverType.UNIVER_SLIDE, label: "Slide", defaultName: "Untitled presentation" },
  { type: UniverType.UNIVER_BOARD, label: "Board", defaultName: "Untitled board" },
  { type: UniverType.UNIVER_BASE, label: "Base", defaultName: "Untitled base" },
  { type: UniverType.UNIVER_PDF, label: "PDF", defaultName: "Untitled PDF" },
] as const;

export type UnitOrigin = "seed" | "create" | "import" | "attachment";

export function isUnitType(value: unknown): value is UniverType {
  return UNIT_TYPES.some(({ type }) => type === value);
}

export interface UnitSummary {
  readonly unitId: string;
  readonly type: UniverType;
  readonly name: string;
  readonly origin: UnitOrigin;
  readonly createdAt: number;
}

export interface CreateUnitInput {
  readonly type: UniverType;
  readonly name: string;
}

export interface CreateUnitResponse {
  readonly unit: UnitSummary;
}

export interface UnitsResponse {
  readonly units: readonly UnitSummary[];
  readonly user: { userId: string; displayName: string };
}

/** Keep the Unit identity and type in links so they can be opened in another browser. */
export function unitLink(unitId: string, type: number) {
  return `/?unit=${encodeURIComponent(unitId)}&type=${type}`;
}
