import { useEffect, useRef, useState } from "react";
import { UNIT_TYPES, unitLink } from "../../shared/units";
import { createUnit } from "../api/units";
import { Dialog, errorMessage } from "./dialog";
import { Icon, UnitIcon } from "./icons";

export function CreateUnitDialog({ onClose }: { onClose(): void }) {
  const [selected, setSelected] = useState<(typeof UNIT_TYPES)[number]>(UNIT_TYPES[0]);
  const [name, setName] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    input.current?.focus();
    input.current?.select();
    return () => { mounted.current = false; };
  }, []);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { unit } = await createUnit({ type: selected.type, name: name?.trim() || selected.defaultName });
      if (mounted.current) {
        location.assign(unitLink(unit.unitId, unit.type));
        onClose();
      }
    } catch (error) {
      if (mounted.current) setError(errorMessage(error, "Unable to create the Unit. Please try again."));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <Dialog title="New Unit" description="A new space for your next idea." onClose={onClose} closeDisabled={busy}>
      <form className="au-dialog-form" aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <div className="au-dialog-content">
          <span id="create-unit-type-label" className="au-field-label">Type</span>
          <div className="au-type-grid" role="group" aria-labelledby="create-unit-type-label">
            {UNIT_TYPES.map((type) => (
              <button
                key={type.type} className="au-type-option" type="button"
                aria-label={`Create ${type.label}`} aria-pressed={type === selected}
                disabled={busy} onClick={() => setSelected(type)}
              >
                <UnitIcon type={type.type} />
                <span>{type.label}</span>
                {type === selected && <span className="au-type-check"><Icon name="check" /></span>}
              </button>
            ))}
          </div>
          <label htmlFor="create-unit-name" className="au-field-label">Name</label>
          <input
            ref={input} id="create-unit-name" className="au-text-input" name="name"
            maxLength={120} autoComplete="off" disabled={busy}
            value={name ?? selected.defaultName} onChange={(event) => setName(event.target.value)}
          />
        </div>
        {error && <p className="au-dialog-error" role="alert">{error}</p>}
        <footer className="au-dialog-footer">
          <button className="au-button au-button-ghost" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="au-button au-button-primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create Unit"}</button>
        </footer>
      </form>
    </Dialog>
  );
}
