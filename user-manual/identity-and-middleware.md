# Identity and Middleware

English | [简体中文](./identity-and-middleware.zh-CN.md)

Middleware is where an application integrates authentication, authorization, logging, tracing, rate limiting, and external systems into the collaboration lifecycle. Each of the three layers sees a different request: Transport handles HTTP ingress, Endpoint handles real-time Sessions, and Service handles authoritative collaboration data operations.

## What each layer controls

| Layer | When it runs | Suitable uses |
| --- | --- | --- |
| Transport HTTP middleware | Every ordinary HTTP request entering the SDK | Authentication, CORS, tracing, ingress logging |
| Endpoint middleware | WebSocket connect, JOIN, and Presence | Real-time room policies, member display, Presence validation or filtering |
| Service middleware | Data lifecycle operations such as read, create, submit, delete, and recover | ACL, quotas, audit, metrics, external integrations |

Endpoint `joinUnit` only decides whether a Session may enter a real-time room; it cannot replace Service read authorization. Snapshots, blocks, and missing changesets can all be read through HTTP without requiring the client to have JOINed.

## Two context paths

Ordinary document data requests use the current HTTP request context:

```text
HTTP snapshot / block / fetch-missing / new-changes / delete / recover
→ Transport middleware sets ctx.userID and ctx.customData
→ Endpoint calls the Service API
→ Service middleware reads the same userID and customData
```

A WebSocket Session inherits the HTTP context that issued its one-time ticket:

```text
GET /universer-api/user/session-ticket
→ Transport middleware sets ctx.userID and ctx.customData
→ Endpoint stores the association and returns an opaque ticket
→ WebSocket open consumes the ticket once
→ Endpoint creates Session { userID, memberID, customData }
→ Endpoint middleware reads through ctx.session
```

The ticket string itself does not contain `userID/customData`. Of all HTTP routes, only session-ticket extends the current Transport context into a WebSocket Session. Other HTTP requests' `customData` belongs only to the current request. Service middleware receives data from the current HTTP request and does not automatically merge Session `customData`.

## Do not mix these three identifiers

| Identifier | Meaning | Source and lifecycle |
| --- | --- | --- |
| `userID` | Stable application user identity and confirmed changeset author | Provided by the application on every HTTP request |
| `memberID` | Online member ID of the current WebSocket Session | Created by Endpoint; changes after reconnect |
| `sid + reqId` | Idempotency key for a changeset submission | Created by the Collaboration Client; reused on retry |

The application decides how to authenticate and writes its business primary key to `ctx.userID`. The SDK does not prescribe Cookies, Bearer tokens, user tables, or role models. User fields, `memberID`, and confirmed revisions in browser payloads cannot replace the server context.

`new-changes` is an HTTP request, while ACK and broadcast are sent over WebSocket. Endpoint uses the payload's `memberID` to locate the online Session, verifies that the Session's `userID` matches the current HTTP `ctx.userID`, and confirms that it has JOINed the target Unit. The application does not need to associate the two channels itself.

## Install in Transport, Endpoint, Service order

```ts
// Runs when every Collaboration HTTP request enters the SDK; authenticate,
// establish a trace, or record network logs here.
transport.use(async (ctx, next) => {
  const user = await auth.requireUser(ctx.incomingMessage);
  ctx.userID = user.userId;
  ctx.customData.traceID = readTraceID(ctx.incomingMessage);
  await next();
});

// Runs when a Session first JOINs a Unit, before it enters the real-time room.
// userID/customData come from the Transport HTTP request that issued the ticket.
endpoint.use('joinUnit', async (ctx, next) => {
  if (!await acl.canRead(ctx.session.userID, ctx.unitID)) {
    throw new CollabError('PERMISSION_DENIED', 'Cannot join this Unit');
  }
  await next();
});

// Runs when Endpoint submits a changeset over HTTP and Service enters the
// logical submit lifecycle. userID/customData come from the current Transport request.
collabService.use('submitChangeset', async (ctx, next) => {
  const unitID = ctx.request.changeset.unitID;
  if (!await acl.canEdit(ctx.userID, unitID)) {
    throw new CollabError('PERMISSION_DENIED', 'Unit is read-only');
  }

  const startedAt = performance.now();
  await next();
  metrics.observeSubmit(performance.now() - startedAt);
});
```

Middleware registered for the same action runs in registration order, and `await next()` enters the next middleware. Authentication failures should end the HTTP response directly without calling `next()`; use `CollabError` for expected collaboration rejections.

## What belongs in customData

`customData` is a mutable object scoped to the current request or Session. Suitable values include:

- Current user, tenant, and trace ID;
- ACL query results reused within the same call;
- Timing start points, logger children, or temporary service objects.

It is not automatically written to the collaboration database, sent to the browser, or logged. Business data that must persist should be written explicitly to application storage.

## Retries and external side effects

A Service action describes a lifecycle stage, not a business purpose. The same action can carry authorization, logging, and metrics middleware together. Before choosing an action, check its trigger timing, visible fields, and retry semantics in the corresponding Package README.

The main Service's `applyChangeset` and `commitChangeset` can run repeatedly because of revision contention. They must be retryable and must not send irreversible webhooks, charges, or messages. Use Service events for in-process work after database commit. For reliable delivery to external systems, use a transactional outbox in the Database Adapter and application.

History, Comment, and Worktree each have independent Service middleware. Protecting the main Collaboration Service does not automatically protect these optional capabilities; see [Optional capabilities](./extensions.md).
