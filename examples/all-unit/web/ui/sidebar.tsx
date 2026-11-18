import { useState } from "react";
import { UNIT_TYPES, unitLink, type UnitSummary } from "../../shared/units";
import { Icon, UnitIcon } from "./icons";

const modifiedTime = new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" });

interface SidebarProps {
  units: readonly UnitSummary[];
  selectedId?: string | undefined;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  onCreate(): void;
  onImport(): void;
}

export function Sidebar({ units, selectedId, loading, loaded, error, onCreate, onImport }: SidebarProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <aside className="au-sidebar" aria-label="Unit sidebar" data-expanded={expanded}>
      <div className="au-brand">
        <span className="au-brand-symbol"><Icon name="brand" /></span>
        <div><h2>All Unit</h2><p>Univer Collaboration</p></div>
      </div>
      <div className="au-sidebar-actions" role="group" aria-label="Add a Unit">
        <button className="au-button au-button-primary" type="button" onClick={onCreate}>
          <Icon name="plus" />New Unit
        </button>
        <button className="au-button au-button-secondary" type="button" onClick={onImport}>
          <Icon name="upload" />Import
        </button>
      </div>
      <div className="au-list-heading"><span>ALL UNITS</span><span className="au-unit-count">{units.length}</span></div>
      <button className="au-mobile-switcher" type="button" aria-controls="units"
        aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
        <span>All units <span className="au-unit-count">{units.length}</span></span>
        <Icon name="chevron" />
      </button>
      <nav id="units" className="au-unit-list" aria-label="Units" aria-busy={loading}>
        {units.map(unit => {
          const label = UNIT_TYPES.find(item => item.type === unit.type)?.label ?? "Unit";
          const modified = modifiedTime.format(unit.updatedAt);
          return (
            <a key={unit.unitId} className="au-unit-link" href={unitLink(unit.unitId, unit.type)}
              title={`${unit.name} · Last modified ${modified}`}
              aria-current={unit.unitId === selectedId ? "page" : undefined}
              onClick={() => setExpanded(false)}>
              <UnitIcon type={unit.type} />
              <span className="au-unit-copy">
                <span className="au-unit-name">{unit.name}</span>
                <span className="au-unit-meta">{label} · {modified}</span>
              </span>
            </a>
          );
        })}
      </nav>
      {error ? (
        <p className="au-list-message" role="alert">{error}</p>
      ) : units.length === 0 && (loading || loaded) && (
        <p className="au-list-message" role="status">
          {loading ? "Loading units…" : "No units yet. Create or import one to get started."}
        </p>
      )}
      <p className="au-sidebar-footer"><Icon name="people" /><span>Open in another tab to collaborate</span></p>
    </aside>
  );
}
