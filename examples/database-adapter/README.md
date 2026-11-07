# Database Adapter

English | [简体中文](./README.zh-CN.md)

A Database Adapter stores documents (Units), snapshots, Sheet blocks, and changesets. This example
uses the SDK's built-in `SQLiteDatabaseAdapter` by default and shows how to change the storage and
write an Adapter of your own.

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

Implement `IDatabaseAdapter` and pass it as `dbAdapter`. Transactions, revision CAS, and Unit
deletion and recovery live inside the Adapter; `commitChangeset` inserts a changeset only when the
current head equals `changeset.revision - 1` and otherwise returns `revision-mismatch` for the
Service to retry. The three built-in Adapters are the reference: the
[Memory Adapter](https://github.com/dream-num/univer-collaboration-sdk-community/tree/main/packages/collaboration-database-memory) is the shortest complete implementation of the
contract, and the [SQLite](https://github.com/dream-num/univer-collaboration-sdk-community/tree/main/packages/collaboration-database-sqlite) and
[PostgreSQL](https://github.com/dream-num/univer-collaboration-sdk-community/tree/main/packages/collaboration-database-postgres) Adapters show the same contract on database
transactions.

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
