# Examples

示例按“协议兼容 → 业务认证 → 完整办公套件”逐步增加应用层能力，彼此不共享业务代码。

| 示例 | 状态 | 数据库 | 身份与权限 | 重点 |
|---|---|---|---|---|
| [`basic-sheets`](./basic-sheets/README.md) | 可运行 | SQLite | 固定 `demo-user`，固定 allowed | 上游式 Univer Sheet 前端、实时协同、持久化、历史恢复 |
| [`jwt-memory-auth`](./jwt-memory-auth/README.md) | 可运行的认证与权限示例 | Memory | JWT Cookie + 内存 ACL | 用户系统和 `admin/editor/viewer` middleware 集成 |
| `basic-auth-demo` | 规划中 | SQLite | Bearer JWT + ACL | 可持久化认证集成示例 |
| [`univer-suite-demo`](./univer-suite-demo/README.md) | Spike：Sheet / Doc / Slide、账号与 Sheet History | SQLite | HttpOnly 会话、资源所有者 middleware | 多类型 Unit 和办公套件纵切面 |

完整需求与后续顺序见 [`roadmap.md`](./roadmap.md)。
