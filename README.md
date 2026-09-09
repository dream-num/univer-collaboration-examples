# Univer Collaboration SDK

English | [简体中文](./README.zh-CN.md)

This repository contains only runnable examples for the Univer Collaboration SDK. The public
documentation is maintained on [office.univer.ai](https://office.univer.ai/collaboration/overview).

## Start here

1. Follow the documentation site's [Quick Start](https://office.univer.ai/collaboration/quick-start)
   and use two browsers to verify the HTTP, WebSocket, and OT path.
2. Choose an example below for the capability you want to explore, then compare its minimal
   frontend and backend source.
3. Use the [Collaboration documentation](https://office.univer.ai/collaboration/overview) for
   architecture, middleware, identity, persistence, and production guidance.

## Choose an example

Each example can run independently. Start with [`quick-start`](./examples/quick-start/README.md)
to establish the main collaboration path, then choose a focused example for the capability you want
to explore. Finally, use `all-integration` to see how multiple capabilities fit together.

| Example | What it demonstrates |
| --- | --- |
| [`quick-start`](./examples/quick-start/README.md) | Minimal real-time Sheet collaboration path |
| [`database-adapter`](./examples/database-adapter/README.md) | SQLite persistence and restart recovery |
| [`permissions`](./examples/permissions/README.md) | Trusted identity and server-side permission boundaries |
| [`history`](./examples/history/README.md) | Version history service and browser entry |
| [`comments`](./examples/comments/README.md) | Thread Comment service and frontend entry |
| [`worktree`](./examples/worktree/README.md) | Complete draft, ready, reopen, and merge lifecycle |
| [`exchange`](./examples/exchange/README.md) | Server-side Sheet import/export with `exchange-node` |
| [`all-integration`](./examples/all-integration/README.md) | Combined integration example: users, roles, five Unit types, comments, history, trash, and Office exchange |

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
pnpm example:exchange
pnpm example:all-integration
```

The examples cover only teaching and copyable assembly. `all-integration` combines multiple SDK
capabilities for reference; it does not cover every capability or serve as a production application
template. The standalone exchange
example intentionally uses an in-memory file/task store rather than a production file service.

`quick-start` intentionally keeps the Memory Adapter for the shortest possible setup. Every other
example uses SQLite so state survives server restarts; see each example's README for its database path.

Fixed users, demo authorization, and local secrets are for teaching only and are not production
configuration. Before integrating in production, read
[Identity and authorization](https://office.univer.ai/collaboration/identity-and-authorization),
[Middleware and Events](https://office.univer.ai/collaboration/middleware-and-events), and
[Database Adapters](https://office.univer.ai/collaboration/database-adapters).
