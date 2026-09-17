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

All examples use the same minimal `web/main.ts + server/main.ts` structure and can run
independently. Start with [`quick-start`](./examples/quick-start/README.md) to establish the main
collaboration path, then choose another example for the capability you want to explore.

| Example | What it demonstrates |
| --- | --- |
| [`quick-start`](./examples/quick-start/README.md) | Minimal real-time Sheet collaboration path |
| [`all-unit`](./examples/all-unit/README.md) | Five fixed Unit types, sidebar switching, and SQLite persistence |
| [`database-adapter`](./examples/database-adapter/README.md) | SQLite persistence and restart recovery |
| [`permissions`](./examples/permissions/README.md) | Trusted identity and server-side permission boundaries |
| [`history`](./examples/history/README.md) | Version history service and browser entry |
| [`comments`](./examples/comments/README.md) | Thread Comment service and frontend entry |
| [`worktree`](./examples/worktree/README.md) | Complete draft, ready, reopen, and merge lifecycle |
| [`exchange`](./examples/exchange/README.md) | Server-side Sheet import/export with `exchange-node` |
| [`multi-node`](./examples/multi-node/README.md) | File creation and listing with Nginx consistent hashing by unitID across two collaboration nodes |

## Run the examples

Prepare Node.js 24 or later and pnpm:

```bash
pnpm install
pnpm example:quick-start
```

The other examples use the same command form:

```bash
pnpm example:all-unit
pnpm example:database-adapter
pnpm example:permissions
pnpm example:history
pnpm example:comments
pnpm example:worktree
pnpm example:exchange
pnpm example:multi-node
```

The examples cover only teaching and copyable assembly. They do not include file spaces
or a complete office suite. The exchange example intentionally uses
an in-memory file/task store rather than a production file service.

`quick-start` uses the Memory Adapter to keep setup minimal. The other single-node examples store
collaboration data in their own `.data/collaboration.sqlite` file so state survives server restarts.
`multi-node` requires Docker Compose and builds inside its containers. Its shared SQLite database
lives in a Docker volume.

Fixed users, demo authorization, and local secrets are for teaching only and are not production
configuration. Before integrating in production, read
[Identity and authorization](https://office.univer.ai/collaboration/identity-and-authorization),
[Middleware and Events](https://office.univer.ai/collaboration/middleware-and-events), and
[Database Adapters](https://office.univer.ai/collaboration/database-adapters).
