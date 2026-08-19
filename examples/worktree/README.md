# Worktree

English | [简体中文](./README.zh-CN.md)

Shows how to collaborate in an isolated draft and use ready, reopen, and merge to manage how changes enter trunk.

```bash
pnpm example:worktree
```

Open <http://127.0.0.1:3010/?unit=worktree-sheet&type=2&worktree=demo-worktree>. The example creates the fixed `demo-worktree` and enters draft by default. The toolbar switches between trunk and draft and runs Ready, Reopen, and Merge in sequence.

Read only `server/main.ts` and `web/main.ts`. Worktree has its own Service, Adapter, and collaboration path and shares only the one-time ticket store with the trunk Endpoint.
