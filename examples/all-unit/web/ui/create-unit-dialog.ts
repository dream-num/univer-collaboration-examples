import { UNIT_TYPES, type CreateUnitInput } from "../../shared/units";
import { createDialog, errorMessage } from "./dialog";
import { icon, unitIcon } from "./icons";

interface CreateUnitDialogOptions {
  onCreate(input: CreateUnitInput): Promise<void>;
}

export function createUnitDialog(options: CreateUnitDialogOptions) {
  const view = createDialog("create-unit", "New Unit", "A new space for your next idea.", "Create Unit");
  view.content.innerHTML = `
    <span id="create-unit-type-label" class="au-field-label">Type</span>
    <div class="au-type-grid" role="group" aria-labelledby="create-unit-type-label"></div>
    <label for="create-unit-name" class="au-field-label">Name</label>
    <input id="create-unit-name" class="au-text-input" name="name" maxlength="120" autocomplete="off" />
  `;
  const types = view.content.querySelector<HTMLDivElement>(".au-type-grid")!;
  const name = view.content.querySelector<HTMLInputElement>("input")!;
  let selected: (typeof UNIT_TYPES)[number] = UNIT_TYPES[0];
  let nameEdited = false;
  let busy = false;
  let disposed = false;

  const choices = UNIT_TYPES.map(type => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "au-type-option";
    button.setAttribute("aria-label", `Create ${type.label}`);
    const label = document.createElement("span");
    label.textContent = type.label;
    const check = document.createElement("span");
    check.className = "au-type-check";
    check.append(icon("check"));
    button.append(unitIcon(type.type), label, check);
    button.addEventListener("click", () => {
      selected = type;
      if (!nameEdited) name.value = selected.defaultName;
      updateChoices();
    });
    types.append(button);
    return { type, button, check };
  });

  function updateChoices() {
    for (const choice of choices) {
      const active = choice.type.type === selected.type;
      choice.button.setAttribute("aria-pressed", String(active));
      choice.check.hidden = !active;
    }
  }

  function setBusy(value: boolean) {
    busy = value;
    view.form.setAttribute("aria-busy", String(value));
    view.submit.disabled = value;
    view.cancel.disabled = value;
    view.close.disabled = value;
    name.disabled = value;
    choices.forEach(choice => { choice.button.disabled = value; });
    view.submit.textContent = value ? "Creating…" : "Create Unit";
  }

  function close() {
    if (!busy) view.dialog.close();
  }

  view.close.addEventListener("click", close);
  view.cancel.addEventListener("click", close);
  view.dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
  view.dialog.addEventListener("click", event => { if (event.target === view.dialog) close(); });
  name.addEventListener("input", () => { nameEdited = true; });
  view.form.addEventListener("submit", event => {
    event.preventDefault();
    if (busy || disposed) return;
    view.error.hidden = true;
    setBusy(true);
    void options.onCreate({ type: selected.type, name: name.value.trim() || selected.defaultName })
      .then(() => { if (!disposed) view.dialog.close(); })
      .catch((error: unknown) => {
        if (disposed) return;
        view.error.textContent = errorMessage(error, "Unable to create the Unit. Please try again.");
        view.error.hidden = false;
      })
      .finally(() => { if (!disposed) setBusy(false); });
  });

  return {
    open() {
      if (disposed || view.dialog.open) return;
      selected = UNIT_TYPES[0];
      nameEdited = false;
      name.value = selected.defaultName;
      view.error.hidden = true;
      setBusy(false);
      updateChoices();
      view.dialog.showModal();
      name.focus();
      name.select();
    },
    dispose() {
      disposed = true;
      view.dialog.close();
      view.dialog.remove();
    },
  };
}
