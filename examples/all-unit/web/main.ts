import type { UnitsResponse } from "../shared/units";
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
  const selected = units.find((unit) => unit.unitId === url.searchParams.get("unit")) ?? units[0];
  if (!selected) throw new Error("No units available");

  // The collaboration plugin reads Unit identity from the URL; normalize it against the server catalog before setup.
  url.searchParams.set("unit", selected.unitId);
  url.searchParams.set("type", String(selected.type));
  history.replaceState(null, "", url);

  for (const unit of units) {
    const link = document.createElement("a");
    const target = new URL(location.pathname, location.origin);
    target.searchParams.set("unit", unit.unitId);
    target.searchParams.set("type", String(unit.type));
    link.href = target.href;
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
