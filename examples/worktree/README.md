# Worktree

English | [简体中文](./README.zh-CN.md)

Shows how to collaborate in an isolated draft and use ready, reopen, and merge to manage how changes enter trunk.

```bash
pnpm example:worktree
```

Open <http://127.0.0.1:3010/?unit=worktree-sheet&worktree=demo-worktree>. The example creates the fixed `demo-worktree` in draft. The toolbar switches between trunk and draft and enables the action the current status allows:

| Action | Transition | Effect |
| --- | --- | --- |
| Ready | draft → ready | Freezes the draft; edits are rejected until it is reopened or merged |
| Reopen | ready → draft | Unfreezes the draft for more edits |
| Merge | ready → merged | Applies the draft to trunk; merged is final |

A merged Worktree cannot be reopened, and its draft can no longer be opened. The status survives
restarts, so to run the lifecycle again stop the server, run
`pnpm --filter @univerjs/collaboration-example-worktree reset` to delete `.data`, and start it again.

Read only `server/main.ts` and `web/main.ts`. Worktree has its own Service, Adapter, and collaboration
path and shares only the one-time ticket store with the trunk Endpoint. The trunk and Worktree SQLite
Adapters share `.data/collaboration.sqlite`; both data and Worktree status survive server restarts.
