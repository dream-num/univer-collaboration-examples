# Database Adapter

English | [简体中文](./README.zh-CN.md)

A collaborative Sheet whose data survives a server restart. A Database Adapter stores Units,
snapshots, Sheet blocks, and changesets; this example uses the SQLite Adapter and shows how to
change to another one.

## Run the example

Prepare Node.js 24 or later and pnpm, then run from the repository root:

```bash
pnpm install
pnpm example:database-adapter
```

Open <http://127.0.0.1:3010/?unit=persistent-sheet>:

1. Open the same URL in two tabs, edit a cell, and confirm the change has synchronized.
2. Press `Ctrl+C` in the terminal to stop the server, then run the same startup command again.
3. Refresh the page and confirm your edits are still there.

Data is stored in `examples/database-adapter/.data/collaboration.sqlite`. The first start creates
`persistent-sheet`; subsequent starts restore the document from stored snapshots and changesets.

## Connect an Adapter

In [`server/main.ts`](./server/main.ts), inject the Adapter into `UniverCollabService`:

```ts
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";

const database = new SQLiteDatabaseAdapter({ filename: ".data/collaboration.sqlite" });
const service = new UniverCollabService({ dbAdapter: database });
```

The parent directory must exist before creating the Adapter; the full entry point creates it for
you. The application owns the Adapter: stop the Services using it before calling
`database.dispose()`.

## Change the storage

Replace `dbAdapter`. For several nodes on one database, use the PostgreSQL Adapter. The
application owns the connection pool; `create` initializes an empty `collaboration` schema and
verifies an existing one:

```ts
import { PostgresDatabaseAdapter } from "@univerjs-pro/collaboration-database-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const database = await PostgresDatabaseAdapter.create({ pool });
```

The [`multi-node`](../multi-node/README.md) example runs two nodes on it.

## Write your own Adapter

Implement `IDatabaseAdapter` and pass it as `dbAdapter`. The Service does not add transactions,
CAS, or deduplication on top of an Adapter; the Adapter provides them on its own database. The
Memory Adapter is the shortest complete implementation of the contract, and the SQLite and
PostgreSQL Adapters show the same contract on database transactions.

### commitChangeset

`commitChangeset` is the key to concurrent submissions. It uses revision CAS (compare-and-swap): a
changeset can be inserted only when the current database head equals `changeset.revision - 1`,
after which the head advances to `changeset.revision`. The check, insert, and head update must be
atomic in the database, with no partial writes on failure.

Return `committed` on success. If the head differs, leave the data unchanged and return
`revision-mismatch` with `actualHeadRevision`, allowing the Service to reload history, handle
concurrent changes, and retry. The SQLite Adapter does this in one write transaction; the PostgreSQL
Adapter locks the Unit row with `FOR UPDATE`.

The Service handles OT and submission deduplication, middleware handles authorization, and the
Endpoint handles real-time broadcasts.

## Reset data

Stop the server, then run from the repository root:

```bash
pnpm --filter @univerjs/collaboration-example-database-adapter reset
```

This deletes the SQLite database file of this example. The next start creates a blank document.

## Packages

The three Adapters are open source under Apache-2.0 in
[univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community) and are published to npm under the same names and versions
as the rest of the SDK. Use them as they are, or take the source as the reference for your own.

| Package | Description |
| --- | --- |
| [`@univerjs-pro/collaboration-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-database-sqlite/README.md) | SQLite Adapter on `libsql`, for a single node. Used here. |
| [`@univerjs-pro/collaboration-database-postgres`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-database-postgres/README.md) | PostgreSQL Adapter on `node-postgres`, for one or several nodes. |
| [`@univerjs-pro/collaboration-database-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-database-memory/README.md) | In-process Adapter for tests and temporary services. |
