# Examples

[English](./README.md) | 简体中文

所有示例使用相同的 `web/main.ts + server/main.ts` 最小结构，并且可以独立运行。建议先从
[`quick-start`](./quick-start/README.zh-CN.md) 建立协同主链路，再按当前问题选择其他示例。

| 示例                                               | 内容                                         |
| -------------------------------------------------- | -------------------------------------------- |
| [`quick-start`](./quick-start/README.zh-CN.md)           | 最小 Sheet 实时协同链路                      |
| [`database-adapter`](./database-adapter/README.zh-CN.md) | SQLite 持久化与重启恢复                      |
| [`permissions`](./permissions/README.zh-CN.md)           | 可信身份与服务端权限边界                     |
| [`history`](./history/README.zh-CN.md)                   | 版本历史服务与浏览器入口                     |
| [`comments`](./comments/README.zh-CN.md)                 | Thread Comment 服务与前端入口                |
| [`worktree`](./worktree/README.zh-CN.md)                 | draft、ready、reopen 和 merge 的完整生命周期 |
| [`exchange`](./exchange/README.zh-CN.md)                 | 基于 `exchange-node` 的 Sheet 服务端导入导出 |

示例只承担教学和可复制装配，不包含文件空间、多类型产品编辑器或完整办公套件。exchange 示例
特意使用内存文件与任务存储，不代替生产文件服务。
