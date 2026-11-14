import { icon } from "./icons";

export function createDialog(id: string, title: string, description: string, submitLabel: string) {
  const dialog = document.createElement("dialog");
  dialog.className = "au-dialog";
  dialog.setAttribute("aria-labelledby", `${id}-title`);
  dialog.setAttribute("aria-describedby", `${id}-description`);
  dialog.innerHTML = `
    <form class="au-dialog-form">
      <header class="au-dialog-header">
        <div><h2 id="${id}-title"></h2><p id="${id}-description"></p></div>
        <button class="au-button au-button-icon au-close" type="button" aria-label="Close dialog"></button>
      </header>
      <div class="au-dialog-content"></div>
      <p class="au-dialog-error" role="alert" hidden></p>
      <footer class="au-dialog-footer">
        <button class="au-button au-button-ghost au-cancel" type="button">Cancel</button>
        <button class="au-button au-button-primary au-submit" type="submit"></button>
      </footer>
    </form>
  `;
  dialog.querySelector("h2")!.textContent = title;
  dialog.querySelector(`#${id}-description`)!.textContent = description;
  const close = dialog.querySelector<HTMLButtonElement>(".au-close")!;
  close.append(icon("close"));
  const submit = dialog.querySelector<HTMLButtonElement>(".au-submit")!;
  submit.textContent = submitLabel;
  document.body.append(dialog);
  return {
    dialog,
    form: dialog.querySelector<HTMLFormElement>("form")!,
    content: dialog.querySelector<HTMLDivElement>(".au-dialog-content")!,
    error: dialog.querySelector<HTMLParagraphElement>(".au-dialog-error")!,
    close,
    cancel: dialog.querySelector<HTMLButtonElement>(".au-cancel")!,
    submit,
  };
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
