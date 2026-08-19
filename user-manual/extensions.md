# Optional Capabilities

English | [简体中文](./extensions.zh-CN.md)

Complete the main Collaboration path first, then select optional capabilities for product requirements. History, Thread Comment, and Worktree each have an independent Service, middleware, and Database Adapter, but they can reuse the same Transport, application authentication, and SQLite file.

| Requirement | What to add | Example to run first |
| --- | --- | --- |
| User-facing version history | History Service + Endpoint + Adapter | [History](../examples/history/README.md) |
| Sheet/Doc Thread Comment | Comment Service + Endpoint + Adapter | [Comments](../examples/comments/README.md) |
| Isolated draft, review, and merge into trunk | Worktree Service + Endpoint + Client + Adapter | [Worktree](../examples/worktree/README.md) |

Each example's `server/main.ts` and `web/main.ts` are the recommended assembly references. Consult the corresponding Package README for exact constructor options, APIs, middleware actions, and resource disposal.

## History

History groups confirmed revisions into user-facing history entries and completes creator profiles. It is a derived index of collaboration data; confirmed changesets stored by the Collaboration Service remain the authoritative source of Unit state.

```text
Transport
├─→ UniverHistoryEndpoint → UniverHistoryService → History Adapter
└─→ UniverCollabEndpoint  → UniverCollabService  → core Adapter
```

Assemble core first, then create the History Service and call `attach(collabService)`. Finally, register the History Endpoint and the main Endpoint on the same Transport. The History Service has independent middleware. The User Provider only completes names and avatars; it is not an authorization boundary.

`attach()` is suitable for updating the derived index in process. Failure does not roll back already confirmed collaboration data. If the history index must never be lost, write a transactional outbox in the collaboration commit transaction and update History with a repeatable task.

## Thread Comment

The Comment Service stores comment content, replies, edits, and solved state. Root anchors that change with the Sheet/Doc structure remain part of the main collaboration snapshot and changesets. Both parts must be included in the product data lifecycle.

```text
Transport
├─→ UniverCommentEndpoint → UniverCommentService → Comment Adapter
└─→ UniverCollabEndpoint  → UniverCollabService  → core Adapter
```

The Comment Endpoint publishes `comment_update` through the main Endpoint's Unit room, so pass the main Endpoint as `roomHost` when constructing it. Reading comments is ordinary HTTP; writing comments is associated with an online Session that has already JOINed. Every route calls the Comment Service with the current Transport HTTP request's `userID/customData`; install Comment authorization in Comment Service middleware.

A real-time delivery failure does not roll back a committed comment; the client can recover by listing comments again. Real-time broadcast currently still covers only one main Endpoint process.

## Worktree

Worktree provides an isolated collaborative draft for one or more Units, together with ready, reopen, discard, merge evaluation, and per-Unit merge. It reuses the trunk Service's OT and submit engine, while draft changesets, state, and real-time rooms are isolated by `(worktreeID, unitID)`.

```text
Transport
├─→ Worktree Endpoint → Worktree Service → Worktree Adapter
└─→ trunk Endpoint    → trunk Service    → core Adapter
```

The trunk Endpoint and Worktree Endpoint must share the same session ticket store. The provided memory implementation is suitable for the recommended topology in which both run in one process. Apart from that shared store, the two Endpoint, Service, and Adapter sets have independent lifecycles.

```text
create → draft → ready → merging → merged
           ↑       │
           └ reopen┘

draft / ready → discarded
```

Only `draft` accepts further submissions. `markReady` freezes each Unit's current draft revision. Multi-Unit merge advances per Unit and is not atomic across Units; the product UI should show the merge result of every Unit.

Worktree middleware and trunk Service middleware are independent. The former protects draft visibility, editing, and merge; final writes to trunk still enter the trunk Service's own authorization middleware. Worktree real-time rooms, state events, and broadcasts currently also guarantee only one Endpoint process.

## Shared storage and lifecycle rules

- Core, History, Comment, and Worktree SQLite Adapters can use the same database file, but they are different contracts and resource objects and must be created and disposed independently.
- Optional Services do not inherit middleware from the main Service; the application must install the required read and write policies on each one.
- Core hard delete does not automatically clean up data from other modules. The application coordinates cross-module deletion and retention policies.
- All Collaboration and Univer packages must use exact versions from the same matching release cohort.
