# Worktree

[English](./README.md) | 简体中文

Worktree 是一个或多个 Unit 的隔离草稿，面向"Agent 编辑、人类审阅"的场景：Agent 在 draft 里反复
编辑，完成后标记 Ready；人类通过 Web 审阅结果，决定是否进入 trunk。完整流程见
[Worktree：Agent 编辑与人类审阅](https://docs.univer.ai/zh-CN/ai/worktree)；本示例只展示 draft
协同链路和生命周期操作。

```bash
pnpm example:worktree
```

打开 <http://127.0.0.1:3010/?unit=worktree-sheet&worktree=demo-worktree>。示例会创建固定的
`demo-worktree`，初始为 draft；工具栏同时扮演两个角色：先像 Agent 一样编辑 draft，再像人类一样审阅。
Trunk/Draft 切换视图，按钮只启用当前状态允许的操作。

```text
create → draft → ready → merged
           ↑       │
           └ reopen┘
draft / ready → discarded
```

| 状态 | 含义 | 可用操作 |
| --- | --- | --- |
| draft | 编辑中；trunk 看不到这些修改 | Ready、Discard |
| ready | 已冻结等待审阅；拒绝编辑 | Merge、Reopen、Discard |
| merged | draft 的修改已进入 trunk；终态 | 无 |
| discarded | draft 的修改已放弃；trunk 不受影响；终态 | 无 |

Ready 和 Merge 刻意分成两步：Ready 冻结 Agent 的产出，划出审阅边界；Merge 是审阅者的决定。Reopen 把
ready 的 draft 交回去再改一轮；Discard 放弃 draft，不影响 trunk。merged 和 discarded 会在重启后保留；
要重新走一遍生命周期，先停止服务，运行 `pnpm --filter @univerjs/collaboration-example-worktree reset`
删除 `.data`，再重新启动。

只需要阅读 `server/main.ts` 和 `web/main.ts`。Worktree 有独立 Service、Adapter 和协同路径，
只与 trunk Endpoint 共享一次性 ticket store。trunk 与 Worktree SQLite Adapter 共享
`.data/collaboration.sqlite`，数据与 Worktree 状态都会在服务重启后保留。
