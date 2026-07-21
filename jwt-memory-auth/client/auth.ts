export async function login(username: string, password: string): Promise<void> {
  const response = await fetch("/api/login", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) throw new Error("Login failed");

  // JWT 在 HttpOnly Cookie 中，前端不读取和保存 token。
}

export async function grantDocumentRole(
  unitId: string,
  userId: string,
  role: "admin" | "editor" | "viewer"
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

  if (!response.ok) throw new Error("Unable to grant document role");
}

export async function getDocumentRole(
  unitId: string
): Promise<"admin" | "editor" | "viewer"> {
  const response = await fetch(`/api/units/${encodeURIComponent(unitId)}/access`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Unable to read document role");
  return (await response.json()).role;
}
