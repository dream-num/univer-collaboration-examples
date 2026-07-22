import {
  createUnit,
  getCurrentUser,
  getDocumentRole,
  grantDocumentRole,
  login,
  type AuthenticatedUser,
  type DocumentRole,
} from "./auth";
import {
  openCollaborativeSheet,
  type CollaborationView,
} from "./univer";
import "./style.css";

const loginPanel = element<HTMLElement>("login-panel");
const application = element<HTMLElement>("application");
const loginForm = element<HTMLFormElement>("login-form");
const username = element<HTMLInputElement>("username");
const password = element<HTMLInputElement>("password");
const loginError = element<HTMLElement>("login-error");
const currentUser = element<HTMLElement>("current-user");
const unitIDInput = element<HTMLInputElement>("unit-id");
const unitRole = element<HTMLElement>("unit-role");
const syncStatus = element<HTMLElement>("sync-status");
const members = element<HTMLElement>("members");
const targetUser = element<HTMLSelectElement>("target-user");
const targetRole = element<HTMLSelectElement>("target-role");
const activity = element<HTMLElement>("activity");

let view: CollaborationView | undefined;

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void run(async () => {
    const user = await login(username.value, password.value);
    showApplication(user);
  }, loginError);
});

element<HTMLButtonElement>("create-unit").addEventListener("click", () => {
  void run(async () => {
    const created = await createUnit();
    unitIDInput.value = created.unitID;
    history.replaceState(null, "", `?unitID=${encodeURIComponent(created.unitID)}`);
    log(`Created ${created.unitID}`);
    await openUnit(created.unitID);
  });
});

element<HTMLButtonElement>("open-unit").addEventListener("click", () => {
  void run(() => openUnit(unitIDInput.value.trim()));
});

element<HTMLButtonElement>("grant-role").addEventListener("click", () => {
  void run(async () => {
    const unitID = requiredUnitID();
    await grantDocumentRole(
      unitID,
      targetUser.value,
      targetRole.value as DocumentRole
    );
    log(`Granted ${targetRole.value} to ${targetUser.value}`);
  });
});

window.addEventListener("beforeunload", () => view?.dispose());

void run(async () => {
  const user = await getCurrentUser();
  if (!user) return;
  showApplication(user);
});

function showApplication(user: AuthenticatedUser): void {
  loginPanel.hidden = true;
  application.hidden = false;
  currentUser.textContent = `${user.username} (${user.userId})`;
  const unitID = new URL(location.href).searchParams.get("unitID");
  if (unitID) {
    unitIDInput.value = unitID;
    void run(() => openUnit(unitID));
  }
}

async function openUnit(unitID: string): Promise<void> {
  if (!unitID) throw new Error("请输入 unitID");
  const role = await getDocumentRole(unitID);
  unitRole.textContent = `role: ${role}`;
  syncStatus.textContent = "connecting";
  view?.dispose();
  document.querySelector("#univer-container")?.replaceChildren();
  view = await openCollaborativeSheet(unitID, role, {
    members: (names) => {
      members.textContent = `在线：${names.join(", ") || "-"}`;
    },
    status: (status) => {
      syncStatus.textContent = `sync: ${status}`;
    },
  });
  unitIDInput.value = unitID;
  history.replaceState(null, "", `?unitID=${encodeURIComponent(unitID)}`);
  log(`Opened ${unitID} as ${role}`);
}

function requiredUnitID(): string {
  const value = unitIDInput.value.trim();
  if (!value) throw new Error("请先创建或输入 unitID");
  return value;
}

async function run(
  operation: () => void | Promise<void>,
  errorTarget: HTMLElement = activity
): Promise<void> {
  errorTarget.textContent = "";
  try {
    await operation();
  } catch (error) {
    errorTarget.textContent = error instanceof Error ? error.message : String(error);
  }
}

function log(message: string): void {
  activity.textContent = `${new Date().toLocaleTimeString()} ${message}`;
}

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing #${id}`);
  return value as T;
}
