# Univer Collaboration SDK

English | [简体中文](./README.zh-CN.md)

This repository contains only runnable examples for the Univer Collaboration SDK. The public
documentation is maintained on [docs.univer.ai](https://docs.univer.ai/server/collaboration/overview).

## Start here

1. Follow the documentation site's [Quick Start](https://docs.univer.ai/server/collaboration/quick-start)
   and use two browsers to verify the HTTP, WebSocket, and OT path.
2. Choose an example below for the capability you want to explore, then compare its minimal
   frontend and backend source.
3. Use the [Collaboration documentation](https://docs.univer.ai/server/collaboration/overview) for
   architecture, middleware, identity, persistence, and production guidance.

## Choose an example

All examples use the same minimal `web/main.ts + server/main.ts` structure and can run
independently. Start with [`quick-start`](./examples/quick-start/README.md) to establish the main
collaboration path, then choose another example for the capability you want to explore.

| Example | What it demonstrates |
| --- | --- |
| [`quick-start`](./examples/quick-start/README.md) | Minimal real-time Sheet collaboration path |
| [`database-adapter`](./examples/database-adapter/README.md) | SQLite persistence and restart recovery |
| [`all-unit`](./examples/all-unit/README.md) | Six fixed Unit types, sidebar switching, and SQLite persistence |
| [`permissions`](./examples/permissions/README.md) | Trusted identity and server-side permission boundaries |
| [`object-permissions`](./examples/object-permissions/README.md) | Worksheet and range protection with an application-owned ACL |
| [`history`](./examples/history/README.md) | Version history service and browser entry |
| [`comments`](./examples/comments/README.md) | Thread Comment service and frontend entry |
| [`worktree`](./examples/worktree/README.md) | Complete draft, ready, reopen, and merge lifecycle |
| [`exchange`](./examples/exchange/README.md) | Server-side Sheet import/export with `exchange-node` |
| [`file-service`](./examples/file-service/README.md) | Application file service for images and attachments: upload, sign-url, and download routes with on-disk storage |
| [`multi-node`](./examples/multi-node/README.md) | File creation and listing across two collaboration nodes with Redis cross-node delivery and Nginx consistent hashing by unitID |

## Run the examples

Prepare Node.js 24 or later and pnpm:

```bash
pnpm install
pnpm example:quick-start
```

The other examples use the same command form:

```bash
pnpm example:database-adapter
pnpm example:all-unit
pnpm example:permissions
pnpm example:object-permissions
pnpm example:history
pnpm example:comments
pnpm example:worktree
pnpm example:exchange
pnpm example:file-service
pnpm example:multi-node
```

The examples cover only teaching and copyable assembly. They do not include file spaces
or a complete office suite. `file-service`, `exchange`, and `all-unit` keep uploaded files on the
local disk rather than in a production file service; [`file-service`](./examples/file-service/README.md)
explains the routes the Univer client calls and what to change for production.

`quick-start` uses the Memory Adapter to keep setup minimal. The other single-node examples store
collaboration data in their own `.data/collaboration.sqlite` file so state survives server restarts.
`multi-node` requires Docker Compose and builds inside its containers. Both nodes share one PostgreSQL
database whose data lives in a Docker volume.

Fixed users, demo authorization, and local secrets are for teaching only and are not production
configuration. Before integrating in production, read
[Identity and authorization](https://docs.univer.ai/server/collaboration/identity-and-authorization),
[Middleware and Events](https://docs.univer.ai/server/collaboration/middleware-and-events), and
[Database Adapters](https://docs.univer.ai/server/collaboration/database-adapters).
