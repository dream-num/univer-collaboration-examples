# Worktree

[English](./README.md) | 简体中文

展示如何在独立 draft 中协同编辑，并通过 ready、reopen 和 merge 管理修改进入 trunk 的过程。

```bash
pnpm example:worktree
```

打开 <http://127.0.0.1:3010/?unit=worktree-sheet&type=2&worktree=demo-worktree>。示例会创建固定的 `demo-worktree`，默认进入 draft；工具栏可
在 trunk/draft 间切换，并依次执行 Ready、Reopen 和 Merge。

只需要阅读 `server/main.ts` 和 `web/main.ts`。Worktree 有独立 Service、Adapter 和协同路径，
只与 trunk Endpoint 共享一次性 ticket store。
