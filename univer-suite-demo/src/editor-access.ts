export interface EditorResource {
  readonly id: string;
  readonly unitID: string;
  readonly type: number;
  readonly name: string;
  readonly status: string;
  readonly updatedAt: number;
  readonly accessRole: "owner" | "editor" | "viewer";
  readonly owner: {
    readonly userId: string;
    readonly username: string;
    readonly name: string;
  };
}

export type EditorAccessResult =
  | {
      readonly status: "allowed";
      readonly resource: EditorResource;
    }
  | {
      readonly status:
        | "invalid-link"
        | "unauthenticated"
        | "unavailable"
        | "service-error";
    };

export interface ResolveEditorAccessInput {
  readonly resourceID: string | null;
  readonly unitID: string;
  readonly type: number;
}

/**
 * 编辑器初始化会立即请求 snapshot，因此必须先确认产品资源归属。权限失败统一为
 * unavailable，避免通过前端错误状态泄露资源是否存在。
 */
export async function resolveEditorAccess(
  input: ResolveEditorAccessInput,
  request: typeof fetch = fetch
): Promise<EditorAccessResult> {
  if (!input.resourceID) return { status: "invalid-link" };

  let response: Response;
  try {
    response = await request(
      `/api/units/${encodeURIComponent(input.resourceID)}/open`,
      { method: "POST", credentials: "include" }
    );
  } catch {
    return { status: "service-error" };
  }

  if (response.status === 401) return { status: "unauthenticated" };
  if (response.status === 403 || response.status === 404) {
    return { status: "unavailable" };
  }
  if (!response.ok) return { status: "service-error" };

  let resource: EditorResource | undefined;
  try {
    resource = ((await response.json()) as { resource?: EditorResource })
      .resource;
  } catch {
    return { status: "service-error" };
  }

  if (
    !resource ||
    resource.id !== input.resourceID ||
    resource.unitID !== input.unitID ||
    resource.type !== input.type ||
    resource.status !== "active" ||
    !["owner", "editor", "viewer"].includes(resource.accessRole)
  ) {
    return { status: "invalid-link" };
  }

  return { status: "allowed", resource };
}
