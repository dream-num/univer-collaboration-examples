import { useEffect, useState } from "react";
import { unitLink, type UnitsResponse } from "../shared/units";
import { getUnits } from "./api/units";
import { CreateUnitDialog } from "./ui/create-unit-dialog";
import { ImportUnitDialog } from "./ui/import-unit-dialog";
import { RefreshNotice } from "./ui/refresh-notice";
import { Sidebar } from "./ui/sidebar";
import { Editor } from "./univer/editor";

const LIST_REFRESH_INTERVAL_MS = 5_000;

export function App() {
  const [selectedId, setSelectedId] = useState(() => new URL(location.href).searchParams.get("unit"));
  const [catalog, setCatalog] = useState<UnitsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [dialog, setDialog] = useState<"create" | "import" | null>(null);
  const units = catalog?.units ?? [];
  const selected = units.find((unit) => unit.unitId === selectedId);

  useEffect(() => {
    const controller = new AbortController();
    let refreshing = false;
    let loaded = false;

    async function refresh() {
      if (refreshing || controller.signal.aborted) return;
      refreshing = true;
      try {
        const result = await getUnits(controller.signal);
        if (controller.signal.aborted) return;
        setCatalog(result);
        setSelectedId((current) => current ?? (
          result.units.find((unit) => unit.unitId === "all-unit-sheet") ?? result.units[0]
        )?.unitId ?? null);
        setError(null);
        setRefreshFailed(false);
        loaded = true;
      } catch (cause) {
        if (controller.signal.aborted) return;
        console.error(cause);
        if (loaded) setRefreshFailed(true);
        else setError(cause instanceof Error ? cause.message : "Unable to load Units.");
      } finally {
        refreshing = false;
      }
    }

    function backgroundRefresh() {
      if (!document.hidden) void refresh();
    }

    void refresh();
    // Include imports from editor menus, converted attachments, and other browser tabs.
    const timer = window.setInterval(backgroundRefresh, LIST_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", backgroundRefresh);
    document.addEventListener("visibilitychange", backgroundRefresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", backgroundRefresh);
      document.removeEventListener("visibilitychange", backgroundRefresh);
    };
  }, []);

  useEffect(() => {
    if (selected) {
      history.replaceState(null, "", unitLink(selected.unitId, selected.type));
      document.title = `${selected.name} · All Unit`;
    }
  }, [selected?.unitId, selected?.type, selected?.name]);

  return (
    <>
      <Sidebar
        units={units}
        selectedId={selected?.unitId}
        loading={!catalog && !error}
        onCreate={() => setDialog("create")}
        onImport={() => setDialog("import")}
      />
      <main id="workspace">
        <header className="au-document-header">
          <h1 id="document-name">{selected?.name ?? "All Unit"}</h1>
          <span className="au-document-caption">Univer Collaboration</span>
        </header>
        <div className="au-editor-area">
          {selected && catalog ? (
            <Editor unitId={selected.unitId} unitType={selected.type} user={catalog.user} />
          ) : (
            <p id="status" role={error ? "alert" : "status"}>
              {error ?? (!catalog ? "Loading units…" : selectedId
                ? "This Unit could not be found." : "Create or import a Unit to get started.")}
            </p>
          )}
        </div>
      </main>
      {dialog === "create" && <CreateUnitDialog onClose={() => setDialog(null)} />}
      {dialog === "import" && <ImportUnitDialog onClose={() => setDialog(null)} />}
      {refreshFailed && <RefreshNotice />}
    </>
  );
}
