# Univer Collaboration SDK

本仓库提供 Univer Collaboration SDK 的公开用户手册和可运行示例。

## 从这里开始

1. 阅读[快速开始](./user-manual/quick-start.md)，用两个浏览器确认 HTTP、WebSocket 和 OT 主链路。
2. 查看[完整用户手册](./user-manual/README.md)，了解服务端组装、身份、middleware 和生产运行。
3. 按问题选择[可运行示例](./examples/README.md)，对照最小的前后端源码。

## 运行示例

准备 Node.js 24 及以上版本和 pnpm：

```bash
pnpm install
pnpm example:quick-start
```

其他示例使用同样的命令形式：

```bash
pnpm example:database-adapter
pnpm example:permissions
pnpm example:history
pnpm example:comments
pnpm example:worktree
```

固定用户、演示授权和本地密钥仅用于教学，不是生产配置。生产接入前请阅读
[身份与 middleware](./user-manual/identity-and-middleware.md)和[生产运行](./user-manual/production.md)。
