export type DocumentRole = "admin" | "editor" | "viewer";

export interface AuthenticatedUser {
  readonly userId: string;
  readonly username: string;
}

export interface CreatedUnit {
  readonly unitID: string;
  readonly type: number;
  readonly role: "admin";
}

export async function login(
  username: string,
  password: string
): Promise<AuthenticatedUser> {
  const response = await fetch("/api/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) throw new Error(await responseMessage(response));
  return response.json() as Promise<AuthenticatedUser>;
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const response = await fetch("/api/me", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(await responseMessage(response));
  return response.json() as Promise<AuthenticatedUser>;
}

export async function createUnit(): Promise<CreatedUnit> {
  const response = await fetch("/api/units", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Shared Sheet" }),
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  return response.json() as Promise<CreatedUnit>;
}

export async function grantDocumentRole(
  unitId: string,
  userId: string,
  role: DocumentRole
): Promise<void> {
  const response = await fetch(
    `/api/units/${encodeURIComponent(unitId)}/members/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }
  );

  if (!response.ok) throw new Error(await responseMessage(response));
}

export async function getDocumentRole(unitId: string): Promise<DocumentRole> {
  const response = await fetch(`/api/units/${encodeURIComponent(unitId)}/access`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error(await responseMessage(response));
  return (await response.json() as { role: DocumentRole }).role;
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}
