import { openCollaborativeSheet } from "./univer.js";
import "./style.css";

const state = document.querySelector<HTMLElement>("#connection-state")!;
const message = document.querySelector<HTMLElement>("#connection-message")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;

retry.addEventListener("click", () => location.reload());

void start();

async function start(): Promise<void> {
  try {
    const url = new URL(location.href);
    const unitID = url.searchParams.get("unit");
    if (!unitID) {
      message.textContent = "Creating a collaborative sheet…";
      const response = await fetch(
        "/universer-api/snapshot/2/unit/-/create",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "Collaborative Sheet", type: 2 }),
        }
      );
      if (!response.ok) throw new Error("The server could not create a Sheet");
      const created = (await response.json()) as { unitID?: string };
      if (!created.unitID) throw new Error("The server returned no unitID");
      url.searchParams.set("unit", created.unitID);
      url.searchParams.set("type", "2");
      location.replace(url);
      return;
    }

    message.textContent = "Loading the collaborative sheet…";
    await openCollaborativeSheet(unitID, (status) => {
      if (status === "ready") {
        state.hidden = true;
        return;
      }
      state.hidden = false;
      message.textContent = status;
    });
  } catch (error) {
    state.hidden = false;
    message.textContent =
      error instanceof Error ? error.message : "Unable to load the Sheet";
    retry.hidden = false;
  }
}
