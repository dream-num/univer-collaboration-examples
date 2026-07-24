import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UniverType } from "@univerjs/protocol";
import { CollabError } from "@univerjs/collaboration-service";
import { afterEach, describe, expect, it } from "vitest";
import type { WorkspaceApplication } from "../server/application.js";
import { createWorkspaceApplication } from "../server/application.js";

const applications: WorkspaceApplication[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const application of applications.splice(0).reverse()) {
    await application.close();
  }
  for (const directory of directories.splice(0).reverse()) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Workspace Worktree application", () => {
  it("submits structured changeset results without changing the Comb protocol", async () => {
    const origin = await startApplication();
    const cookie = await login(origin);
    const personal = await personalSpace(origin, cookie);
    const resource = await createUnit(origin, cookie, personal.id, "Budget");
    const worktreeID = randomUUID();
    const created = await request<{
      worktree: {
        worktreeID: string;
        status: string;
        units: Array<{ unitID: string; draftHeadRevision: number }>;
      };
    }>(`${origin}/api/worktrees`, cookie, {
      method: "POST",
      body: {
        worktreeID,
        name: "Budget agent",
        scope: { kind: "user" },
        resourceIDs: [resource.id],
      },
    });
    expect(created.response.status).toBe(201);
    expect(created.body.worktree).toMatchObject({
      worktreeID,
      status: "draft",
      units: [{ unitID: resource.unitID, draftHeadRevision: 1 }],
    });

    const snapshot = await fetch(
      `${origin}/universer-api/worktrees/${worktreeID}/snapshot/${UniverType.UNIVER_SHEET}/unit/${resource.unitID}/rev/0`,
      { headers: { cookie } }
    );
    expect(snapshot.status).toBe(200);

    const changeset = {
      unitID: resource.unitID,
      type: UniverType.UNIVER_SHEET,
      baseRev: 1,
      revision: 2,
      sid: randomUUID(),
      reqId: 1,
      userID: "untrusted",
      memberID: "untrusted",
      mutations: [
        {
          id: "sheet.mutation.set-workbook-name",
          data: JSON.stringify({ unitId: resource.unitID, name: "Draft name" }),
        },
      ],
    };
    const committed = await request<{
      status: string;
      changeset: { revision: number; userID: string };
    }>(
      `${origin}/api/worktrees/${worktreeID}/units/${resource.unitID}/submit_changesets`,
      cookie,
      { method: "POST", body: { changeset } }
    );
    expect(committed.body).toMatchObject({
      status: "committed",
      changeset: { revision: 2, userID: "user-alice" },
    });

    const replay = await request<{ status: string }>(
      `${origin}/api/worktrees/${worktreeID}/units/${resource.unitID}/submit_changesets`,
      cookie,
      { method: "POST", body: { changeset } }
    );
    expect(replay.body.status).toBe("already-committed");

    const rejected = await request<{
      status: string;
      error: { code: string; message: string };
    }>(
      `${origin}/api/worktrees/${worktreeID}/units/${resource.unitID}/submit_changesets`,
      cookie,
      {
        method: "POST",
        body: {
          changeset: {
            ...changeset,
            sid: randomUUID(),
            baseRev: 999,
            revision: 1000,
          },
        },
      }
    );
    expect(rejected.body).toMatchObject({
      status: "rejected",
      error: {
        code: "REVISION_MISMATCH",
      },
    });
  });

  it("keeps Worktree-created Units staged until merge activation", async () => {
    const origin = await startApplication();
    const cookie = await login(origin);
    const personal = await personalSpace(origin, cookie);
    const worktreeID = randomUUID();
    await request(`${origin}/api/worktrees`, cookie, {
      method: "POST",
      body: {
        worktreeID,
        name: "New document",
        scope: { kind: "user" },
      },
    });
    const resourceID = randomUUID();
    const unitID = randomUUID();
    const created = await request<{
      worktree: {
        units: Array<{
          resourceID: string;
          unitID: string;
          resourceStatus: string;
        }>;
      };
    }>(`${origin}/api/worktrees/${worktreeID}/units/new`, cookie, {
      method: "POST",
      body: {
        resourceID,
        unitID,
        spaceID: personal.id,
        name: "Agent document",
        type: UniverType.UNIVER_DOC,
      },
    });
    expect(created.response.status).toBe(201);
    expect(created.body.worktree.units).toEqual([
      expect.objectContaining({
        resourceID,
        unitID,
        resourceStatus: "staged",
      }),
    ]);
    expect(
      await fetch(`${origin}/api/units/${resourceID}`, {
        headers: { cookie },
      })
    ).toMatchObject({ status: 404 });

    await request(
      `${origin}/api/worktrees/${worktreeID}/ready`,
      cookie,
      { method: "POST" }
    );
    const merged = await request<{
      worktree: {
        status: string;
        units: Array<{ resourceStatus: string }>;
      };
    }>(`${origin}/api/worktrees/${worktreeID}/merge`, cookie, {
      method: "POST",
    });
    expect(
      merged.body.worktree.status,
      JSON.stringify(merged.body, null, 2)
    ).toBe("merged");
    expect(merged.body.worktree.units).toEqual([
      expect.objectContaining({ resourceStatus: "active" }),
    ]);
    expect(
      await fetch(`${origin}/api/units/${resourceID}`, {
        headers: { cookie },
      })
    ).toMatchObject({ status: 200 });
  });

  it.each([
    {
      label: "Sheet",
      type: UniverType.UNIVER_SHEET,
      mutationID: "sheet.mutation.set-workbook-name",
    },
    {
      label: "Slide",
      type: UniverType.UNIVER_SLIDE,
      mutationID: "slide.mutation.set-name",
    },
  ])(
    "creates, edits, and activates a Worktree-local $label",
    async ({ label, type, mutationID }) => {
      const origin = await startApplication();
      const cookie = await login(origin);
      const personal = await personalSpace(origin, cookie);
      const worktreeID = randomUUID();
      const resourceID = randomUUID();
      const unitID = randomUUID();
      await request(`${origin}/api/worktrees`, cookie, {
        method: "POST",
        body: {
          worktreeID,
          name: `New ${label}`,
          scope: { kind: "user" },
        },
      });
      await request(`${origin}/api/worktrees/${worktreeID}/units/new`, cookie, {
        method: "POST",
        body: {
          resourceID,
          unitID,
          spaceID: personal.id,
          name: `Agent ${label}`,
          type,
        },
      });

      const snapshot = await fetch(
        `${origin}/universer-api/worktrees/${worktreeID}/snapshot/${type}/unit/${unitID}/rev/0`,
        { headers: { cookie } }
      );
      expect(snapshot.status).toBe(200);
      const submitted = await request<{ status: string }>(
        `${origin}/api/worktrees/${worktreeID}/units/${unitID}/submit_changesets`,
        cookie,
        {
          method: "POST",
          body: {
            changeset: {
              unitID,
              type,
              baseRev: 1,
              revision: 2,
              sid: randomUUID(),
              reqId: 1,
              userID: "",
              memberID: "",
              mutations: [
                {
                  id: mutationID,
                  data: JSON.stringify({
                    unitId: unitID,
                    name: `Edited ${label}`,
                  }),
                },
              ],
            },
          },
        }
      );
      expect(submitted.body.status).toBe("committed");

      await request(`${origin}/api/worktrees/${worktreeID}/ready`, cookie, {
        method: "POST",
      });
      const merged = await request<{
        worktree: {
          status: string;
          units: Array<{
            unitID: string;
            resourceStatus: string;
            mergeResult?: { status: string };
          }>;
        };
      }>(`${origin}/api/worktrees/${worktreeID}/merge`, cookie, {
        method: "POST",
      });
      expect(merged.body.worktree).toMatchObject({
        status: "merged",
        units: [
          {
            unitID,
            resourceStatus: "active",
            mergeResult: { status: "merged" },
          },
        ],
      });
      expect(
        await fetch(`${origin}/api/units/${resourceID}`, {
          headers: { cookie },
        })
      ).toMatchObject({ status: 200 });
    }
  );

  it("reports partial merge facts without rolling back a merged Unit", async () => {
    const origin = await startApplication();
    const application = applications.at(-1)!;
    const cookie = await login(origin);
    const personal = await personalSpace(origin, cookie);
    const first = await createUnit(origin, cookie, personal.id, "First");
    const second = await createUnit(origin, cookie, personal.id, "Second");
    const worktreeID = randomUUID();
    await request(`${origin}/api/worktrees`, cookie, {
      method: "POST",
      body: {
        worktreeID,
        name: "Partial merge",
        scope: { kind: "user" },
        resourceIDs: [first.id, second.id],
      },
    });
    for (const resource of [first, second]) {
      const submitted = await submitWorkbookName(
        origin,
        cookie,
        worktreeID,
        resource.unitID,
        `${resource.unitID} draft`
      );
      expect(submitted.status).toBe("committed");
    }
    await request(`${origin}/api/worktrees/${worktreeID}/ready`, cookie, {
      method: "POST",
    });
    const rejectSecond = application.collabService.use(
      "submitChangeset",
      async (context, next) => {
        if (context.request.changeset.unitID === second.unitID) {
          throw new CollabError(
            "PERMISSION_DENIED",
            "Second Unit is temporarily blocked"
          );
        }
        await next();
      }
    );

    const partial = await request<{
      worktree: {
        status: string;
        units: Array<{
          unitID: string;
          mergeResult?: {
            status: string;
            error?: { code: string; retryable: boolean };
          };
        }>;
      };
    }>(`${origin}/api/worktrees/${worktreeID}/merge`, cookie, {
      method: "POST",
    });

    expect(partial.body.worktree).toMatchObject({
      status: "ready",
      units: [
        { unitID: first.unitID, mergeResult: { status: "merged" } },
        {
          unitID: second.unitID,
          mergeResult: {
            status: "failed",
            error: { code: "PERMISSION_DENIED", retryable: false },
          },
        },
      ],
    });
    rejectSecond.dispose();

    const recovered = await request<{
      worktree: {
        status: string;
        units: Array<{ unitID: string; mergeResult?: { status: string } }>;
      };
    }>(`${origin}/api/worktrees/${worktreeID}/merge`, cookie, {
      method: "POST",
    });
    expect(recovered.body.worktree).toMatchObject({
      status: "merged",
      units: [
        { unitID: first.unitID, mergeResult: { status: "merged" } },
        { unitID: second.unitID, mergeResult: { status: "merged" } },
      ],
    });
  });
});

async function startApplication(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "workspace-worktree-"));
  directories.push(directory);
  const application = await createWorkspaceApplication({
    databaseFilename: join(directory, "workspace.sqlite"),
    serveClient: false,
  });
  applications.push(application);
  const port = await application.listen(0);
  return `http://127.0.0.1:${port}`;
}

async function login(origin: string): Promise<string> {
  const response = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "alice",
      password: "alice-password",
    }),
  });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")?.split(";", 1)[0] ?? "";
}

async function personalSpace(
  origin: string,
  cookie: string
): Promise<{ id: string }> {
  const result = await request<{
    spaces: Array<{ id: string; type: string }>;
  }>(`${origin}/api/spaces`, cookie);
  return result.body.spaces.find(({ type }) => type === "personal")!;
}

async function createUnit(
  origin: string,
  cookie: string,
  spaceID: string,
  name: string
): Promise<{ id: string; unitID: string }> {
  const result = await request<{
    resource: { id: string; unitID: string };
  }>(`${origin}/api/units`, cookie, {
    method: "POST",
    body: {
      spaceID,
      type: UniverType.UNIVER_SHEET,
      name,
    },
  });
  expect(result.response.status).toBe(201);
  return result.body.resource;
}

async function submitWorkbookName(
  origin: string,
  cookie: string,
  worktreeID: string,
  unitID: string,
  name: string
): Promise<{ status: string }> {
  const result = await request<{ status: string }>(
    `${origin}/api/worktrees/${worktreeID}/units/${unitID}/submit_changesets`,
    cookie,
    {
      method: "POST",
      body: {
        changeset: {
          unitID,
          type: UniverType.UNIVER_SHEET,
          baseRev: 1,
          revision: 2,
          sid: randomUUID(),
          reqId: 1,
          userID: "",
          memberID: "",
          mutations: [
            {
              id: "sheet.mutation.set-workbook-name",
              data: JSON.stringify({ unitId: unitID, name }),
            },
          ],
        },
      },
    }
  );
  return result.body;
}

async function request<T = unknown>(
  url: string,
  cookie: string,
  options: {
    readonly method?: string;
    readonly body?: unknown;
  } = {}
): Promise<{ response: Response; body: T }> {
  const response = await fetch(url, {
    ...(options.method === undefined ? {} : { method: options.method }),
    headers: {
      cookie,
      ...(options.body === undefined
        ? {}
        : { "content-type": "application/json" }),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  return {
    response,
    body: (await response.json()) as T,
  };
}
