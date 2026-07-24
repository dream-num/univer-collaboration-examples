# Examples

示例按“协议兼容 → 业务认证 / Worktree → 完整办公套件”逐步增加应用层能力，彼此
不共享业务代码。

| 示例 | 状态 | 数据库 | 身份与权限 | 重点 |
|---|---|---|---|---|
| [`basic-sheets`](./basic-sheets/README.md) | 可运行 | SQLite | 固定 `demo-user`，固定 allowed | 上游式 Univer Sheet 前端、实时协同、持久化、历史恢复 |
| [`basic-sheets-auth`](./basic-sheets-auth/README.md) | 可运行 | SQLite | HttpOnly JWT + 持久化 ACL | 在 Basic Sheets 上增加用户系统和 `owner/editor/viewer` middleware |
| [`basic-sheets-worktree`](./basic-sheets-worktree/README.md) | 可运行 | SQLite trunk + Worktree | 固定 `demo-user` | Worktree-local Sheet、draft/ready/merge 和重启恢复 |
| [`univer-workspace-demo`](./univer-workspace-demo/README.md) | 可运行的产品纵切面 | SQLite | HttpOnly 会话、空间 RBAC 与个人文档定向分享 | Sheet / Doc / Slide、个人/团队目录、与我共享、最近使用、递归回收站与 Sheet History |

每个 example 的当前实现事实以对应 README 为准；未完成需求与后续顺序见
[`roadmap.md`](./roadmap.md)。
