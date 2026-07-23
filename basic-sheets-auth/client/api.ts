export type UnitRole = "owner" | "editor" | "viewer";

export interface AuthenticatedUser {
  readonly userId: string;
  readonly username: string;
  readonly name: string;
}

export interface UnitMember {
  readonly user: AuthenticatedUser;
  readonly role: UnitRole;
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) return null;
  return (await responseJson<{ user: AuthenticatedUser }>(response)).user;
}

export async function login(
  username: string,
  password: string
): Promise<AuthenticatedUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return (await responseJson<{ user: AuthenticatedUser }>(response)).user;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) throw new Error(await responseMessage(response));
}

export async function createUnit(): Promise<string> {
  const response = await fetch("/universer-api/snapshot/2/unit/-/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "New Sheet" }),
  });
  return (await responseJson<{ unitID: string }>(response)).unitID;
}

export async function getAccess(unitID: string): Promise<UnitRole> {
  const response = await fetch(
    `/api/units/${encodeURIComponent(unitID)}/access`
  );
  return (await responseJson<{ role: UnitRole }>(response)).role;
}

export async function listUsers(): Promise<readonly AuthenticatedUser[]> {
  const response = await fetch("/api/auth/users");
  return (await responseJson<{ users: AuthenticatedUser[] }>(response)).users;
}

export async function listMembers(unitID: string): Promise<{
  readonly role: UnitRole;
  readonly members: readonly UnitMember[];
}> {
  const response = await fetch(
    `/api/units/${encodeURIComponent(unitID)}/members`
  );
  return responseJson(response);
}

export async function setMemberRole(
  unitID: string,
  userId: string,
  role: Exclude<UnitRole, "owner">
): Promise<void> {
  const response = await fetch(
    `/api/units/${encodeURIComponent(unitID)}/members/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role }),
    }
  );
  if (!response.ok) throw new Error(await responseMessage(response));
}

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await responseMessage(response));
  return response.json() as Promise<T>;
}

async function responseMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      readonly error?: string | { readonly message?: string };
    };
    return typeof body.error === "string"
      ? body.error
      : body.error?.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}
