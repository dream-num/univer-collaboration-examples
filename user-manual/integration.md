# Build a Collaboration Service

English | [简体中文](./integration.zh-CN.md)

This chapter first starts a standalone persistent collaboration service, then integrates application users, logging, authorization, and other business logic through Transport, Endpoint, and Service middleware.

## 1. Install server packages

```bash
pnpm add \
  @univerjs-pro/collaboration-service \
  @univerjs-pro/collaboration-endpoint \
  @univerjs-pro/collaboration-transport-node \
  @univerjs-pro/collaboration-database-sqlite \
  @univerjs/protocol
```

The SQLite Adapter supports Node.js 22 or later; runnable examples in this repository uniformly require Node.js 24 or later. All Univer and Collaboration packages must use exact versions from the same matching release cohort.

## 2. Start the basic service

The following service stores data in SQLite and uses a fixed `local-user` to establish a standalone Node service:

```ts
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { SQLiteDatabaseAdapter } from '@univerjs-pro/collaboration-database-sqlite';
import { UniverCollabEndpoint } from '@univerjs-pro/collaboration-endpoint';
import { UniverCollabService } from '@univerjs-pro/collaboration-service';
import { createNodeTransport } from '@univerjs-pro/collaboration-transport-node';

await mkdir('./data', { recursive: true });

const database = new SQLiteDatabaseAdapter({
  filename: './data/collaboration.sqlite',
  busyTimeoutMs: 5_000,
});
const collabService = new UniverCollabService({ dbAdapter: database });
const collabEndpoint = new UniverCollabEndpoint(collabService);
const transport = createNodeTransport();

// The fixed user only establishes the standalone service first. Replace it
// with application authentication in the next section.
transport.use(async (ctx, next) => {
  ctx.userID = 'local-user';
  await next();
});

transport.register(collabEndpoint);

const server = createServer((request, response) => {
  transport.handleRequest(request, response);
});
server.on('upgrade', (request, socket, head) => {
  transport.handleUpgrade(request, socket, head);
});
server.listen(3010);
```

These four objects form the complete server. Transport is the network ingress, Endpoint handles the Univer frontend protocol, Service handles collaboration data, and Database Adapter stores authoritative state. Both ordinary HTTP requests and WebSocket upgrades must be forwarded to Transport; otherwise snapshots can load but real-time Sessions cannot be established.

The fixed user is not suitable for production. After confirming that the basic service starts, integrate the application through middleware in the next section.

## 3. Integrate the application with middleware

Assume the application provides `authenticate()`, `applicationAcl`, and `logger`. In the production service, remove the fixed `local-user` middleware from the previous section. Install the following middleware in Transport, Endpoint, Service order, then call `transport.register(collabEndpoint)`.

```ts
import { CollabError } from '@univerjs-pro/collaboration-service';

// Authenticate every Collaboration HTTP request before it enters the SDK.
transport.use(async (ctx, next) => {
  const user = await authenticate(ctx.incomingMessage);
  if (!user) {
    ctx.response.statusCode = 401;
    ctx.response.end('Authentication required');
    return;
  }

  ctx.userID = user.userId;
  ctx.customData.user = user;
  await next();
});

// Log every Collaboration HTTP request after successful authentication.
transport.use(async (ctx, next) => {
  const startedAt = performance.now();
  try {
    await next();
  } finally {
    logger.info({
      userID: ctx.userID,
      method: ctx.incomingMessage.method,
      url: ctx.incomingMessage.url,
      durationMs: performance.now() - startedAt,
    });
  }
});

// Run when a WebSocket Session first JOINs a Unit, before it enters the room.
// ctx.session identity comes from the Transport HTTP request that issued the ticket.
collabEndpoint.use('joinUnit', async (ctx, next) => {
  if (!await applicationAcl.canRead(ctx.session.userID, ctx.unitID)) {
    throw new CollabError('PERMISSION_DENIED', 'Cannot join this Unit');
  }
  await next();
});

// Run before Service reads the database for an HTTP snapshot, block, or changeset read.
// ctx.userID/customData come from this Transport HTTP request, not the WebSocket Session.
collabService.use('readUnitData', async (ctx, next) => {
  if (!await applicationAcl.canRead(ctx.userID, ctx.request.unitID)) {
    throw new CollabError('PERMISSION_DENIED', 'Unit is not accessible');
  }
  await next();
});

// Run when Endpoint submits a changeset over HTTP and Service enters submission.
collabService.use('submitChangeset', async (ctx, next) => {
  const unitID = ctx.request.changeset.unitID;
  if (!await applicationAcl.canEdit(ctx.userID, unitID)) {
    throw new CollabError('PERMISSION_DENIED', 'Unit is read-only');
  }
  await next();
});

transport.register(collabEndpoint);
```

Authentication, logging, and authorization illustrate the three middleware layers, but middleware is also suitable for tracing, rate limiting, metrics, and external integrations. The example shows only read, JOIN, and submit. The application should also protect Service actions such as Unit create, delete, and recover according to its own policy.

See the `@univerjs-pro/collaboration-service` and `@univerjs-pro/collaboration-endpoint` READMEs for the complete actions, trigger timing, and retry semantics.

## 4. Create the first Unit

The Collaboration protocol opens and edits an existing Unit; it does not implement the product's “create document” flow. An application usually creates the product record and ACL first, then creates the collaboration Unit through Service:

```ts
import { randomUUID } from 'node:crypto';
import { UniverType } from '@univerjs/protocol';

// workbookData and user come from the application's “create document” flow.
const unitID = randomUUID();

await collabService.createUnitFromData(
  {
    type: UniverType.UNIVER_SHEET,
    data: { ...workbookData, id: unitID, rev: 1 },
  },
  {
    userID: user.userId,
    customData: { traceId: randomUUID() },
  }
);
```

`unitID` must be unique within one Service and database, and the initial revision must be `1`. Product records, ACLs, and collaboration Units have different storage boundaries; the application must handle cross-storage failure with transactions or compensation.

Wrapping more Service APIs as application APIs or background tasks is an advanced integration; see the `@univerjs-pro/collaboration-service` README.

## 5. Configure the Univer frontend

```bash
pnpm add \
  @univerjs-pro/collaboration \
  @univerjs-pro/collaboration-client \
  @univerjs-pro/collaboration-client-ui
```

```ts
import { UniverCollaborationPlugin } from '@univerjs-pro/collaboration';
import { UniverCollaborationClientPlugin } from '@univerjs-pro/collaboration-client';
import '@univerjs-pro/collaboration-client/facade';
import {
  BrowserCollaborationSocketService,
  UniverCollaborationClientUIPlugin,
} from '@univerjs-pro/collaboration-client-ui';
import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import { createUniver } from '@univerjs/presets';

const wsOrigin = location.origin.replace(/^http/, 'ws');

const { univerAPI } = createUniver({
  collaboration: true,
  presets: [UniverSheetsCorePreset({ container: 'app' })],
  plugins: [
    UniverCollaborationPlugin,
    [UniverCollaborationClientPlugin, {
      socketService: BrowserCollaborationSocketService,
      snapshotServerUrl: '/universer-api/snapshot',
      collabSubmitChangesetUrl: '/universer-api/comb',
      collabWebSocketUrl: `${wsOrigin}/universer-api/comb/connect`,
      wsSessionTicketUrl: '/universer-api/user/session-ticket',
      // Configure only when the application provides an Authz API:
      // authzUrl: '/universer-api/authz',
    }],
    UniverCollaborationClientUIPlugin,
  ],
});

await univerAPI.getCollaboration().loadSheetAsync(unitID);
```

Collaboration plugins must be registered in `createUniver({ plugins })`. Doc, Slide, Board, and Base use their corresponding loaders, and the type must match the type stored when the server created the Unit.

`authzUrl` is the application's frontend authorization query API and can render a read-only UI. It is not an SDK Endpoint route and cannot replace server-side Service middleware. Omit it when the application does not use this capability.

## 6. Integrate an existing Web framework

An existing Express, Fastify, or Nest application does not change the SDK assembly above. Forward the original Node request for Collaboration protocol paths to `transport.handleRequest()`, and forward the underlying HTTP server's `upgrade` event to `transport.handleUpgrade()`.

Express mounting rewrites `request.url`, so restore `request.originalUrl` before forwarding. Transport must also receive the request stream before `express.json()` or another body parser consumes it. See the `@univerjs-pro/collaboration-transport-node` README for exact code.

## 7. Verify and stop

Open the same `unitID` with two independent browser identities and verify, in order: snapshot loads, WebSocket connects, JOIN succeeds, edits appear in the other window, and data remains after restarting the service.

After stopping new traffic, dispose from the network ingress back toward persistence:

```ts
await transport.dispose();
await collabService.dispose();
await database.dispose();
```

Transport disposes its registered Endpoint. Endpoint does not dispose Service. Service does not dispose the application-injected Database Adapter.

Next, read [Identity and middleware](./identity-and-middleware.md) to understand HTTP context, WebSocket Sessions, and lifecycle actions in more detail.
