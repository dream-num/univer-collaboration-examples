# Univer Collaboration SDK

[English](./README.md) | 简体中文

本仓库只保存 Univer Collaboration SDK 的可运行示例。公开文档统一维护在
[office.univer.ai](https://office.univer.ai/zh-CN/collaboration/overview)。

## 从这里开始

1. 按文档站的[快速开始](https://office.univer.ai/zh-CN/collaboration/quick-start)，用两个浏览器
   确认 HTTP、WebSocket 和 OT 主链路。
2. 从下方选择想了解的功能示例，对照最小的前后端源码。
3. 架构、middleware、身份、持久化和生产运行说明统一查阅
   [协同编辑文档](https://office.univer.ai/zh-CN/collaboration/overview)。

## 选择示例

所有示例使用相同的 `web/main.ts + server/main.ts` 最小结构，并且可以独立运行。建议先从
[`quick-start`](./examples/quick-start/README.zh-CN.md) 建立协同主链路，再根据想了解的功能选择其他示例。

| 示例 | 内容 |
| --- | --- |
| [`quick-start`](./examples/quick-start/README.zh-CN.md) | 最小 Sheet 实时协同链路 |
| [`database-adapter`](./examples/database-adapter/README.zh-CN.md) | SQLite 持久化与重启恢复 |
| [`all-unit`](./examples/all-unit/README.zh-CN.md) | 固定五类 Unit、侧边栏切换与 SQLite 持久化 |
| [`permissions`](./examples/permissions/README.zh-CN.md) | 可信身份与服务端权限边界 |
| [`history`](./examples/history/README.zh-CN.md) | 版本历史服务与浏览器入口 |
| [`comments`](./examples/comments/README.zh-CN.md) | Thread Comment 服务与前端入口 |
| [`worktree`](./examples/worktree/README.zh-CN.md) | draft、ready、reopen 和 merge 的完整生命周期 |
| [`exchange`](./examples/exchange/README.zh-CN.md) | 基于 `exchange-node` 的 Sheet 服务端导入导出 |
| [`multi-node`](./examples/multi-node/README.zh-CN.md) | 文件创建与列表、Nginx 按 unitID 一致性哈希路由到两个协同节点 |

## 运行示例

准备 Node.js 24 及以上版本和 pnpm：

```bash
pnpm install
pnpm example:quick-start
```

其他示例使用同样的命令形式：

```bash
pnpm example:database-adapter
pnpm example:all-unit
pnpm example:permissions
pnpm example:history
pnpm example:comments
pnpm example:worktree
pnpm example:exchange
pnpm example:multi-node
```

示例只承担教学和可复制装配，不包含文件空间或完整办公套件。exchange 示例
特意使用内存文件与任务存储，不代替生产文件服务。

`quick-start` 为保持最短装配刻意保留 Memory Adapter。其余单节点示例把协同数据写入各自的 `.data/collaboration.sqlite`，服务重启后仍会保留。
`multi-node` 需要 Docker Compose，在容器内构建，共同使用的 SQLite 数据库保存在 Docker volume 中。

固定用户、演示授权和本地密钥仅用于教学，不是生产配置。生产接入前请阅读
[身份与权限](https://office.univer.ai/zh-CN/collaboration/identity-and-authorization)、
[Middleware 与 Event](https://office.univer.ai/zh-CN/collaboration/middleware-and-events)和
[Database Adapter](https://office.univer.ai/zh-CN/collaboration/database-adapters)。
