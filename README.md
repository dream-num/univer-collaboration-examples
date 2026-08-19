# Univer Collaboration SDK

English | [简体中文](./README.zh-CN.md)

This repository provides the public user manual and runnable examples for the Univer Collaboration SDK.

## Start here

1. Read the [Quick Start](./user-manual/quick-start.md) and use two browsers to verify the HTTP, WebSocket, and OT path.
2. Read the [complete user manual](./user-manual/README.md) to understand server assembly, identity, middleware, and production operation.
3. Choose a [runnable example](./examples/README.md) for your current problem and compare the minimal frontend and backend source.

## Run the examples

Prepare Node.js 24 or later and pnpm:

```bash
pnpm install
pnpm example:quick-start
```

The other examples use the same command form:

```bash
pnpm example:database-adapter
pnpm example:permissions
pnpm example:history
pnpm example:comments
pnpm example:worktree
```

Fixed users, demo authorization, and local secrets are for teaching only and are not production configuration. Before integrating in production, read [Identity and middleware](./user-manual/identity-and-middleware.md) and [Production operation](./user-manual/production.md).
