import { LocaleType, LogLevel } from "@univerjs/core";
import { UniverCollaborationPlugin } from "@univerjs-pro/collaboration";
import { UniverCollaborationClientPlugin } from "@univerjs-pro/collaboration-client";
import CollaborationClientEnUS from "@univerjs-pro/collaboration-client/locale/en-US";
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from "@univerjs-pro/collaboration-client-ui";
import CollaborationClientUIEnUS from "@univerjs-pro/collaboration-client-ui/locale/en-US";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";
import UniverPresetSheetsCoreEnUS from "@univerjs/preset-sheets-core/locales/en-US";
import { createUniver, defaultTheme, mergeLocales } from "@univerjs/presets";
import "./styles.css";
import "@univerjs/preset-sheets-core/lib/index.css";
import "@univerjs-pro/collaboration-client-ui/lib/index.css";

const status = document.querySelector<HTMLElement>("#status")!;
const picker = document.querySelector<HTMLElement>("#picker")!;

interface FileEntry { unitID: string; name: string }
const unitID = new URLSearchParams(location.search).get("unit");
const nameInput = document.querySelector<HTMLInputElement>("#file-name")!;
const createButton = document.querySelector<HTMLButtonElement>("#new-file")!;
const refreshButton = document.querySelector<HTMLButtonElement>("#refresh-files")!;

function fileURL(unitID: string) {
  // Reload the page when switching documents to reconnect using the new routing key.
  return `/?unit=${encodeURIComponent(unitID)}&type=2`;
}

async function listFiles(): Promise<FileEntry[]> {
  const response = await fetch("/api/files", { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load the file list.");
  return (await response.json() as { files: FileEntry[] }).files;
}

async function refreshFiles() {
  refreshButton.disabled = true;
  try {
    const files = await listFiles();
    const links = await Promise.all(files.map(async (file) => {
      const route = await fetch(`/api/node?unit=${encodeURIComponent(file.unitID)}`, { cache: "no-store" });
      if (!route.ok) throw new Error("Could not determine the document's node.");
      const { node } = await route.json() as { node: string };
      const link = document.createElement("a");
      link.href = fileURL(file.unitID);
      link.title = file.name;
      const name = document.createElement("span");
      name.className = "file-name";
      name.textContent = file.name;
      const badge = document.createElement("span");
      badge.className = "node-badge";
      badge.textContent = node;
      link.append(name, badge);
      if (file.unitID === unitID) {
        link.setAttribute("aria-current", "page");
        document.querySelector<HTMLElement>("#document-title")!.textContent = file.name;
        const documentNode = document.querySelector<HTMLElement>("#document-node")!;
        documentNode.textContent = node;
        documentNode.hidden = false;
      }
      return link;
    }));
    picker.replaceChildren(...links);
    document.querySelector<HTMLElement>("#file-count")!.textContent = String(files.length);
    if (!files.length) {
      const empty = document.createElement("p");
      empty.className = "empty-list";
      empty.textContent = "No files yet";
      picker.append(empty);
    }
    status.textContent = "";
    return files;
  } finally {
    refreshButton.disabled = false;
  }
}

function showError(error: unknown) {
  status.textContent = error instanceof Error ? error.message : String(error);
}

async function main() {
  refreshButton.addEventListener("click", () => void refreshFiles().catch(showError));
  createButton.addEventListener("click", async () => {
    if (createButton.disabled) return;
    createButton.disabled = true;
    try {
      const response = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameInput.value }),
      });
      if (!response.ok) {
        // Gateway and default Express error responses may not be JSON.
        const result = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(result?.error ?? "Could not create the file. Please try again.");
      }
      const result = await response.json() as FileEntry;
      location.assign(fileURL(result.unitID));
    } catch (error) {
      showError(error);
      createButton.disabled = false;
    }
  });
  const files = await refreshFiles();
  if (!unitID) return;
  if (!files.some((file) => file.unitID === unitID)) throw new Error("File not found. Choose a file from the sidebar.");
  document.querySelector<HTMLElement>("#empty-state")!.hidden = true;
  document.querySelector<HTMLElement>("#app")!.hidden = false;

  // Ticket and WebSocket paths lack a unitID; add a custom unit query for Nginx routing.
  // The SDK preserves this routing parameter. Its value must match the current document's unitID.
  const routingQuery = new URLSearchParams({ unit: unitID }).toString();

  const httpProtocol = location.protocol === "https:" ? "https" : "http";
  const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
  const baseURL = `${httpProtocol}://${location.host}/universer-api`;

  createUniver({
    locale: LocaleType.EN_US,
    locales: {
      [LocaleType.EN_US]: mergeLocales(
        UniverPresetSheetsCoreEnUS,
        CollaborationClientEnUS,
        CollaborationClientUIEnUS,
      ),
    },
    theme: defaultTheme,
    logLevel: LogLevel.WARN,
    collaboration: true,
    presets: [UniverSheetsCorePreset({ container: "app" })],
    plugins: [
      [
        UniverLicensePlugin,
        { license: import.meta.env.UNIVER_LICENSE || undefined },
      ],
      UniverCollaborationPlugin,
      [
        UniverCollaborationClientPlugin,
        {
          socketService: BrowserCollaborationSocketService,
          // Use a shorter edit batching delay to make synchronization easier to observe.
          sendChangesetTimeout: 200,
          authzUrl: `${baseURL}/authz`,
          // Reads use round robin; submissions use the path unitID to reach the WebSocket's node.
          snapshotServerUrl: `${baseURL}/snapshot`,
          collabSubmitChangesetUrl: `${baseURL}/comb`,
          // Both URLs must carry the same unit parameter so ticket issuance and WebSocket setup reach the same node.
          collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
          wsSessionTicketUrl: `${baseURL}/user/session-ticket?${routingQuery}`,
        },
      ],
      UniverCollaborationClientUIPlugin,
    ],
  });

}

void main().catch(showError);
