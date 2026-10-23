# Worktree

[English](./README.md) | 简体中文

展示如何在独立 draft 中协同编辑，并通过 ready、reopen 和 merge 管理修改进入 trunk 的过程。

```bash
pnpm example:worktree
```

打开 <http://127.0.0.1:3010/?unit=worktree-sheet&worktree=demo-worktree>。示例会创建固定的 `demo-worktree`，初始为 draft；工具栏可
在 trunk/draft 间切换，并只启用当前状态允许的操作：

| 操作 | 状态变化 | 效果 |
| --- | --- | --- |
| Ready | draft → ready | 冻结 draft；在 reopen 或 merge 之前拒绝编辑 |
| Reopen | ready → draft | 解冻 draft，继续编辑 |
| Merge | ready → merged | 把 draft 合入 trunk；merged 是终态 |

已 merge 的 Worktree 不能 reopen，其 draft 也不能再打开。状态会在重启后保留；要重新走一遍生命周期，
先停止服务，运行 `pnpm --filter @univerjs/collaboration-example-worktree reset` 删除 `.data`，再重新启动。

只需要阅读 `server/main.ts` 和 `web/main.ts`。Worktree 有独立 Service、Adapter 和协同路径，
只与 trunk Endpoint 共享一次性 ticket store。trunk 与 Worktree SQLite Adapter 共享
`.data/collaboration.sqlite`，数据与 Worktree 状态都会在服务重启后保留。
