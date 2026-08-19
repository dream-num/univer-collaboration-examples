# Univer Collaboration SDK User Manual

English | [简体中文](./README.zh-CN.md)

> Applies to the `1.0.0-insiders.20260818-b79e2bb` release cohort. The manual and the examples in this repository use the same exact versions of all `@univerjs/*` and `@univerjs-pro/*` packages.

The Univer Collaboration SDK provides the server-side collaboration core for Univer documents, including OT, collaboration revision management, snapshots, and real-time synchronization. Through Database Adapters, middleware, and events, developers can choose their own database and infrastructure, integrate existing identity, authorization, and business logic, and build a collaboration service for their product requirements.

## Establish the main path first

```text
Univer Collaboration Client
→ Node Transport              Receives HTTP/WebSocket and runs application HTTP middleware
→ UniverCollabEndpoint        Handles frontend protocol, Sessions, and real-time rooms
→ UniverCollabService         Handles collaboration data, OT, revisions, and the Unit lifecycle
→ Database Adapter            Atomically stores snapshots, changesets, and revisions
```

These four layers form one server assembly; they are not four interchangeable integration options. For the first integration, make the complete path work before adding History, Thread Comment, or Worktree for product requirements.

## Recommended reading order

1. [Quick Start](./quick-start.md): run the Quick Start example and use two browsers to verify the complete collaboration path.
2. [Build a collaboration service](./integration.md): start a standalone service, then integrate application logic through middleware.
3. [Identity and middleware](./identity-and-middleware.md): understand HTTP, WebSocket Sessions, and the three extension layers.
4. [Production operation](./production.md): choose persistence, deploy the network entry, start and stop correctly, and diagnose problems.
5. [Optional capabilities](./extensions.md): add History, Thread Comment, and Worktree as needed.

## What each documentation type is for

| Resource | When to read it |
| --- | --- |
| User manual | Complete integration tasks across packages and establish the overall mental model |
| [`examples`](../examples/README.md) | Run and compare real server and frontend code |
| Package README | Look up a package's API, middleware actions, configuration, and resource ownership |

The user manual does not repeat every package's complete API. When you need a specific action, route, or constructor option, consult the corresponding Package README.

## What the application must still provide

- Resolve a stable business `userID` from a Cookie, Session, or Bearer token.
- Store product data such as users, ACLs, tenants, directories, names, and sharing relationships.
- Provide application APIs such as “create document” and create the collaboration Unit in them.
- Integrate authentication, authorization, logging, tracing, or external systems through Transport, Endpoint, and Service middleware.
- Choose persistence, backups, reverse proxy configuration, and deployment topology.

User fields, `memberID`, or revisions supplied by the frontend cannot replace these server-side boundaries.
