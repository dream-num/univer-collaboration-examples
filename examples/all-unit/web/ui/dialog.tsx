import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons";

interface DialogProps {
  title: string;
  description: string;
  children: ReactNode;
  onClose(): void;
  closeDisabled?: boolean;
}

export function Dialog({
  title, description, children, onClose, closeDisabled = false,
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    const element = dialog.current!;
    element.showModal();
    // Close before React removes the element so the browser restores focus to its trigger.
    return () => element.close();
  }, []);

  function close() {
    if (!closeDisabled) onClose();
  }

  return (
    <dialog
      ref={dialog}
      className="au-dialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <header className="au-dialog-header">
        <div><h2 id={`${id}-title`}>{title}</h2><p id={`${id}-description`}>{description}</p></div>
        <button
          className="au-button au-button-icon au-close" type="button"
          aria-label="Close dialog" disabled={closeDisabled} onClick={close}
        >
          <Icon name="close" />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
