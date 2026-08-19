# Production Operation

English | [简体中文](./production.zh-CN.md)

Before going live, verify persistence, network ingress, identity, process topology, and resource disposal together. A successful database commit and real-time message delivery are different guarantees: the Database Adapter stores authoritative data, WebSocket provides low-latency feedback, and the client fetches missing confirmed changesets through HTTP after disconnection.

## Choose a Database Adapter

| Adapter | Suitable scenarios | Limits to understand |
| --- | --- | --- |
| Memory | Tests, local teaching, temporary data | Data is lost when the process exits and is not shared between processes |
| SQLite | Local applications and small-to-medium single-Node deployments | Node.js 22+; the application owns directories, files, backups, and runtime options |
| Custom Adapter | An existing shared database or larger deployment | Must implement `IDatabaseAdapter` and pass the shared contract tests |

The SQLite Adapter guarantees the atomic contracts for initial snapshots, revision CAS, submission idempotency, snapshot visibility, and Unit lifecycle writes. It stores only core collaboration data, not users, ACLs, directories, History, Comment, or Worktree data.

```ts
import { mkdir } from 'node:fs/promises';
import { SQLiteDatabaseAdapter } from '@univerjs-pro/collaboration-database-sqlite';

await mkdir('./data', { recursive: true });

const database = new SQLiteDatabaseAdapter({
  filename: './data/collaboration.sqlite',
  busyTimeoutMs: 5_000,
});
```

An empty database initializes its schema automatically. An incomplete or unsupported schema is rejected and is not migrated automatically. The SQLite Adapter does not change `journal_mode`; the application manages WAL, checkpoints, backup, and restore policies.

## Recommended initial topology

```text
Browser
  │ HTTPS / WSS
Reverse proxy
  │
One Node application process
  ├── Product API, authentication, and ACL
  ├── Transport + Endpoint
  ├── Collaboration Service
  └── SQLite Adapter → persistent volume
```

Sessions, Unit rooms, Presence, ACK, and broadcasts are currently shared only within one Endpoint process. Multiple Service instances with a correct Database Adapter still preserve data correctness through revision CAS, but multiple Endpoint processes do not automatically share online members or real-time rooms; sticky sessions do not provide that missing capability. Deploy the real-time ingress as one Endpoint process for now.

## Reverse proxy and network

The proxy must forward at least these protocol entries:

- `/universer-api/snapshot`: snapshots, blocks, and missing changesets;
- `/universer-api/comb`: HTTP changeset submission;
- `/universer-api/user/session-ticket`: one-time WebSocket ticket;
- `/universer-api/comb/connect`: WebSocket upgrade and real-time messages.

The proxy must preserve the query string and enable WebSocket upgrade for `/comb/connect`. HTTPS pages use WSS. Cross-origin deployment must also handle Cookie/credentials, CORS, and WebSocket origin together.

Transport's default HTTP body and WebSocket message limits are both 16 MiB. Application framework and proxy limits must not be smaller than actual snapshots or changesets, and the WebSocket idle timeout must allow clients to keep long-lived connections.

## Data, events, and backups

| Result | Guarantee |
| --- | --- |
| Confirmed changeset and revision | Atomically persisted by the Database Adapter |
| Duplicate client submission | Idempotent by `(unitID, sid, reqId)` |
| ACK, Presence, and broadcast | Sent in real time within the current Endpoint process; the client recovers through HTTP after failure |
| Service events and History `attach()` | Run in process; failure does not roll back committed data |
| Reliable external delivery such as webhooks or queues | Application and concrete Adapter use a transactional outbox |

Backups must cover more than the core SQLite tables. Product users, ACLs, directories, and enabled History, Comment, and Worktree capabilities all have independent storage boundaries. The application should also coordinate hard delete and cross-module cleanup.

## Startup, readiness, and shutdown

At startup, prepare database directories and configuration first; then create Adapter, Service, Endpoint, and Transport; finally start listening. Readiness checks should confirm that schema initialization and the complete assembly succeeded, not merely that the process is alive.

For shutdown, first remove the instance from the load balancer and stop new traffic, then dispose in this order:

```text
Transport
→ optional Services
→ Collaboration Service
→ optional Database Adapters
→ Collaboration Database Adapter
```

Transport owns and disposes its registered Endpoints. Endpoint does not dispose Service. Service does not dispose an application-injected Adapter. Abrupt termination does not write half a database transaction, but the client may not receive a response and will retry with the original idempotency key.

## Diagnose by symptom

| Symptom | Check first |
| --- | --- |
| Every protocol request is `401` | Whether Transport HTTP middleware recognizes the Cookie/Header and calls `next()` after success |
| Session ticket succeeds but WebSocket returns `401` | Whether the ticket expired or was consumed, and whether the connection URL carries the newly issued ticket |
| HTTP loads but online collaboration never starts | Whether the Node server and proxy forward the `/comb/connect` upgrade |
| Loading works but JOIN is rejected | Endpoint `joinUnit` middleware and the Session's `userID` |
| The room is entered but snapshot is rejected | Service `readUnitData`; JOIN permission cannot replace read permission |
| Reading works but editing does not | Service `submitChangeset` and the application Authz API used for the frontend read-only hint |
| An edit succeeds locally but other windows do not update | Whether multiple Endpoint processes are deployed, or the submit occurred in another Service process |
| Unit disappears after restart | Whether the Memory Adapter is still in use and whether the SQLite file is on a persistent volume |
| Protocol request returns `404` | Whether Express restores the complete `request.originalUrl` and the Endpoint is registered |

Diagnose in Transport HTTP → session ticket → WebSocket upgrade → Endpoint JOIN → Service read/submit → Database order. This is usually faster than reasoning backward from a client error stack.
