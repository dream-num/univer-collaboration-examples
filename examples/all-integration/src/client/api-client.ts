export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    throw new Error(body.code ?? "REQUEST_FAILED");
  }

  return (response.status === 204 ? undefined : response.json()) as Promise<T>;
}
