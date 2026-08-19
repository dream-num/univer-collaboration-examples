# Quick Start

English | [简体中文](./quick-start.zh-CN.md)

For the first integration, run the repository's Quick Start. It uses a fixed user, a fixed Sheet, and the Memory Adapter. Its only goal is to confirm that the browser, HTTP, WebSocket, Endpoint, Service, and OT are all connected.

## Run

Prepare Node.js 24 or later and pnpm, then run from the repository root:

```bash
pnpm install
pnpm example:quick-start
```

Open:

<http://127.0.0.1:3010/?unit=quick-start-sheet&type=2>

Copy the complete URL into another browser or an incognito window. Edit in either window; the same change should appear in the other window in real time.

## Read only two source files

- [`examples/quick-start/server/main.ts`](../examples/quick-start/server/main.ts): the minimal Transport, Endpoint, Service, and Memory Adapter assembly, and how the Node HTTP server forwards requests and WebSocket upgrades.
- [`examples/quick-start/web/main.ts`](../examples/quick-start/web/main.ts): the Univer Collaboration plugins and four protocol URLs.

To keep the code short, the example fixes the user to `demo-user` and makes all frontend permission queries return allowed. Data exists only in memory and is lost when the process stops. None of these are production configuration.

## Where to go after it works

- To build your own service, continue with [Build a collaboration service](./integration.md).
- To verify that data survives a restart first, run `pnpm example:database-adapter` and read the [Database Adapter example](../examples/database-adapter/README.md).
- To see login and read/write permissions, run `pnpm example:permissions` and read the [Permissions example](../examples/permissions/README.md).
- To add version history, comments, or Worktree, see [Optional capabilities](./extensions.md).

If the two windows do not synchronize, do not change OT or the Service API first. Follow [Production operation](./production.md#diagnose-by-symptom) and check HTTP, ticket, WebSocket, JOIN, and submit layer by layer.
