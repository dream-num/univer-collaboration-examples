import { describe, expect, it, vi } from "vitest";
import { resolveEditorAccess } from "../src/editor-access.js";

const input = {
  resourceID: "resource-1",
  unitID: "unit-1",
  type: 2,
} as const;

describe("resolveEditorAccess", () => {
  it("allows an active resource matching the editor URL", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        resource: {
          id: "resource-1",
          unitID: "unit-1",
          type: 2,
          name: "Budget",
          status: "active",
          updatedAt: 1,
          accessRole: "owner",
          owner: { userId: "alice", username: "alice", name: "Alice" },
        },
      })
    );

    await expect(resolveEditorAccess(input, request)).resolves.toMatchObject({
      status: "allowed",
      resource: { name: "Budget" },
    });
    expect(request).toHaveBeenCalledWith("/api/units/resource-1/open", {
      method: "POST",
      credentials: "include",
    });
  });

  it.each([403, 404])(
    "hides inaccessible resources returned as %s",
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status }));

      await expect(resolveEditorAccess(input, request)).resolves.toEqual({
        status: "unavailable",
      });
    }
  );

  it("rejects a resource that does not match the editor URL", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        resource: {
          id: "resource-1",
          unitID: "another-unit",
          type: 2,
          name: "Budget",
          status: "active",
          updatedAt: 1,
          accessRole: "owner",
          owner: { userId: "alice", username: "alice", name: "Alice" },
        },
      })
    );

    await expect(resolveEditorAccess(input, request)).resolves.toEqual({
      status: "invalid-link",
    });
  });

  it("reports expired sessions without initializing the editor", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 401 }));

    await expect(resolveEditorAccess(input, request)).resolves.toEqual({
      status: "unauthenticated",
    });
  });
});
