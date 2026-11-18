import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./styles.css";

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
window.addEventListener("pagehide", () => root.unmount());
// Recreate the disposed collaboration connection when restoring from the back-forward cache.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
