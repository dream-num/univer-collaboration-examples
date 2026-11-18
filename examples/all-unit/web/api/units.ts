import type { CreateUnitInput, CreateUnitResponse, UnitsResponse } from "../../shared/units";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || `Request failed (${response.status})`);
  return body as T;
}

export async function getUnits(signal?: AbortSignal): Promise<UnitsResponse> {
  const timeout = AbortSignal.timeout(15_000);
  return readResponse<UnitsResponse>(await fetch("/api/units", {
    cache: "no-store", signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  }));
}

export async function createUnit(input: CreateUnitInput): Promise<CreateUnitResponse> {
  return readResponse<CreateUnitResponse>(await fetch("/api/units", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  }));
}
