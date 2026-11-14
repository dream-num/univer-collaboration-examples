import { unitLink, type UnitSummary } from "../shared/units";
import { importUnit } from "./api/import";
import { createUnit, getUnits } from "./api/units";
import { createUnitDialog } from "./ui/create-unit-dialog";
import { createImportUnitDialog } from "./ui/import-unit-dialog";
import { notify } from "./ui/notifications";
import { createSidebar } from "./ui/sidebar";
import type { MountedUniverEditor } from "./univer/types";

const LIST_REFRESH_INTERVAL_MS = 5_000;

export function startApp(): () => void {
  const status = document.querySelector<HTMLElement>("#status")!;
  const documentName = document.querySelector<HTMLElement>("#document-name")!;
  const url = new URL(location.href);
  let selectedId = url.searchParams.get("unit") ?? undefined;
  let units: readonly UnitSummary[] = [];
  let editor: MountedUniverEditor | undefined;
  let disposed = false;
  let refreshFailed = false;
  let refreshController: AbortController | undefined;
  let refreshing: ReturnType<typeof getUnits> | undefined;

  const sidebar = createSidebar({
    onCreate: () => createDialog.open(),
    onImport: () => importDialog.open(),
  });

  function openUnit(unitId: string, type: number) {
    if (!disposed) location.assign(unitLink(unitId, type));
  }

  const createDialog = createUnitDialog({
    onCreate: async (input) => {
      const { unit } = await createUnit(input);
      // The destination reloads the catalog; a background list request must not delay navigation.
      openUnit(unit.unitId, unit.type);
    },
  });
  const importDialog = createImportUnitDialog({
    onImport: async (file, type, options) => {
      const unitId = await importUnit(file, type, options);
      if (!options.signal.aborted) openUnit(unitId, type);
    },
  });

  async function refreshUnits() {
    if (refreshing) return refreshing;
    if (disposed) throw new DOMException("Page closed", "AbortError");
    refreshController = new AbortController();
    const request = getUnits(refreshController.signal);
    refreshing = request;
    try {
      const result = await request;
      if (!disposed) {
        units = result.units;
        sidebar.render(units, selectedId);
        const selected = units.find((unit) => unit.unitId === selectedId);
        if (selected) documentName.textContent = selected.name;
        refreshFailed = false;
      }
      return result;
    } finally {
      if (refreshing === request) refreshing = undefined;
    }
  }

  function backgroundRefresh() {
    if (disposed || document.hidden) return;
    void refreshUnits().catch((error: unknown) => {
      if (disposed) return;
      console.error(error);
      if (!refreshFailed) notify("Unable to refresh Units. Retrying shortly.", "error");
      refreshFailed = true;
    });
  }

  async function mount() {
    sidebar.setLoading?.(true);
    const { user } = await refreshUnits();
    if (disposed) return;
    const selected = selectedId
      ? units.find((unit) => unit.unitId === selectedId)
      : units.find((unit) => unit.unitId === "all-unit-sheet") ?? units[0];
    if (!selected) {
      status.textContent = selectedId ? "This Unit could not be found." : "Create or import a Unit to get started.";
      documentName.textContent = "All Unit";
      return;
    }
    selectedId = selected.unitId;
    history.replaceState(null, "", unitLink(selected.unitId, selected.type));
    sidebar.render(units, selectedId);
    documentName.textContent = selected.name;
    document.title = `${selected.name} · All Unit`;
    status.textContent = `Loading ${selected.name}…`;

    const { mountUniverEditor } = await import("./univer/mount-editor");
    if (disposed) return;
    const mounted = await mountUniverEditor({
      container: "editor", user, locale: "en-US",
      unitType: selected.type, unitId: selected.unitId,
    });
    if (disposed) {
      mounted.dispose();
      return;
    }
    editor = mounted;
    status.hidden = true;
  }

  void mount().catch((error: unknown) => {
    if (disposed) return;
    console.error(error);
    status.hidden = false;
    status.textContent = error instanceof Error ? error.message : "Unable to open the editor";
    status.setAttribute("role", "alert");
  }).finally(() => {
    if (!disposed) sidebar.setLoading?.(false);
  });

  // Polling covers imports from editor menus, converted attachments, and other browser tabs.
  const refreshTimer = window.setInterval(backgroundRefresh, LIST_REFRESH_INTERVAL_MS);
  window.addEventListener("focus", backgroundRefresh);
  document.addEventListener("visibilitychange", backgroundRefresh);

  return () => {
    if (disposed) return;
    disposed = true;
    refreshController?.abort();
    window.clearInterval(refreshTimer);
    window.removeEventListener("focus", backgroundRefresh);
    document.removeEventListener("visibilitychange", backgroundRefresh);
    createDialog.dispose();
    importDialog.dispose();
    sidebar.dispose();
    editor?.dispose();
  };
}
