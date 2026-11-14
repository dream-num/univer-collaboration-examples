import { icon } from "./icons";

export function notify(message: string, kind: "success" | "error" = "success"): void {
  let container = document.querySelector<HTMLDivElement>("#app-notifications");
  if (!container) {
    container = document.createElement("div");
    container.id = "app-notifications";
    container.className = "au-notifications";
    container.setAttribute("aria-label", "Notifications");
    document.body.append(container);
  }
  const notification = document.createElement("div");
  notification.className = `au-notification au-notification-${kind}`;
  notification.setAttribute("role", kind === "error" ? "alert" : "status");
  const text = document.createElement("span");
  text.textContent = message;
  const close = document.createElement("button");
  close.className = "au-button au-button-icon";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss notification");
  close.append(icon("close"));
  notification.append(icon(kind === "success" ? "check" : "close"), text, close);
  container.append(notification);
  const timer = window.setTimeout(() => notification.remove(), kind === "error" ? 10_000 : 5_000);
  close.addEventListener("click", () => { window.clearTimeout(timer); notification.remove(); });
}
