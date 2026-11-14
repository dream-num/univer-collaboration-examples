import { startApp } from "./app";
import "./styles.css";

const dispose = startApp();
window.addEventListener("pagehide", dispose);
// Recreate the disposed collaboration connection when restoring from the back-forward cache.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) location.reload();
});
