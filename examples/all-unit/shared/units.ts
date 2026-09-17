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
