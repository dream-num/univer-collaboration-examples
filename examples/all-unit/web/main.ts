import { unitLink, type UnitsResponse, type UnitSummary } from "../shared/units";
import type { MountedUniverEditor } from "./univer/types";
import "./styles.css";

const status = document.querySelector<HTMLElement>("#status")!;
const navigation = document.querySelector<HTMLElement>("#units")!;
let editor: MountedUniverEditor | undefined;

async function main() {
  const response = await fetch("/api/units");
  if (!response.ok) throw new Error(`Unable to load units (${response.status})`);
  const { units, user } = await response.json() as UnitsResponse;
  const url = new URL(location.href);
  const selected = selectUnit(units, url.searchParams);
  if (!selected) throw new Error("No units available");

  // Keep the selected Unit in the URL so the page can be shared and reloaded.
  history.replaceState(null, "", unitLink(selected.unitId, selected.type));

  for (const unit of units) {
    const link = document.createElement("a");
    link.href = unitLink(unit.unitId, unit.type);
    link.textContent = unit.name;
    if (unit.unitId === selected.unitId) link.setAttribute("aria-current", "page");
    navigation.append(link);
  }

  document.title = `${selected.name} · All Unit`;
  status.textContent = `Loading ${selected.name}…`;
  const { mountUniverEditor } = await import("./univer/mount-editor");
  editor = await mountUniverEditor({
    container: "editor", user, locale: "en-US",
    unitType: selected.type, unitId: selected.unitId,
  });
  status.hidden = true;
}

function selectUnit(units: readonly UnitSummary[], params: URLSearchParams): UnitSummary | undefined {
  const unitId = params.get("unit");
  const known = units.find((unit) => unit.unitId === unitId);
  if (known) return known;
  const type = Number(params.get("type"));
  return unitId && type ? { unitId, type, name: "Imported" } : units[0];
}

window.addEventListener("pagehide", () => editor?.dispose());
// Recreate the disposed collaboration connection when restoring from the back-forward cache.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
void main().catch((error: unknown) => {
  console.error(error);
  status.textContent = error instanceof Error ? error.message : "Unable to open the editor";
  status.setAttribute("role", "alert");
});
