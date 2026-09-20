# Database Adapter

English | [简体中文](./README.zh-CN.md)

A Database Adapter stores documents (Units), snapshots, Sheet blocks, and changesets. This example uses the SDK's built-in `SQLiteDatabaseAdapter` by default and includes three custom implementations to help you understand the `IDatabaseAdapter` interface and use these implementations as a reference when connecting your own storage.

## Run the example

Prepare Node.js 24 or later and pnpm, then run from the repository root:

```bash
pnpm install
pnpm example:database-adapter
```

Open <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>:

1. Open the same URL in two tabs, edit a cell, and confirm the change has synchronized.
2. Press `Ctrl+C` in the terminal to stop the server, then run the same startup command again.
3. Refresh the page and confirm your edits are still there.

Data is stored in `examples/database-adapter/.data/collaboration.sqlite`. The first start creates `persistent-sheet`; subsequent starts restore the document from stored snapshots and changesets.

## Connect an Adapter

In [`server/main.ts`](./server/main.ts), inject the Adapter into `UniverCollabService`:

```ts
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";

const database = new SQLiteDatabaseAdapter({ filename: ".data/collaboration.sqlite" });
const service = new UniverCollabService({ dbAdapter: database });
```

The parent directory must exist before creating the Adapter; the full entry point creates it for you. To change storage, replace `dbAdapter`. The application owns the Adapter: stop the Services using it before calling `database.dispose()`.

## Custom Adapters

All three implement `IDatabaseAdapter`. Start with the Memory version to understand the interface, then see how the SQLite and PostgreSQL versions implement it with database transactions:

| Implementation | Focus |
| --- | --- |
| [CustomMemoryDatabaseAdapter](./server/custom-database-adapter/custom-memory-database-adapter.ts) | Uses Maps to demonstrate reads, revision checks, deletion, and recovery; data is lost when the process exits |
| [CustomSQLiteDatabaseAdapter](./server/custom-database-adapter/custom-sqlite-database-adapter.ts) | Uses `libsql` and MessagePack to demonstrate schema, transactions, and protocol object storage; data survives restarts |
| [CustomPostgresDatabaseAdapter](./server/custom-database-adapter/custom-postgres-database-adapter.ts) | Implements the same contract on PostgreSQL with `pg`, using row locks and CTEs to coordinate concurrent submissions, deletions, and recoveries |

To try one, uncomment its import and constructor in `server/main.ts`, comment out the current constructor, and rerun the startup command. Custom SQLite uses `.data/custom-collaboration.sqlite`; its schema differs from the built-in Adapter, so it must use a separate file. Custom PostgreSQL additionally requires a reachable server; follow the commented block in `server/main.ts` to connect and set it up.

### commitChangeset

`commitChangeset` is the key to concurrent submissions. It uses revision CAS (compare-and-swap): a changeset can be inserted only when the current database head equals `changeset.revision - 1`, after which the head advances to `changeset.revision`. The check, insert, and head update must be atomic in the database, with no partial writes on failure.

Return `committed` on success. If the head differs, leave the data unchanged and return `revision-mismatch` with `actualHeadRevision`, allowing the Service to reload history, handle concurrent changes, and retry. The custom SQLite example implements this with a `BEGIN IMMEDIATE` transaction.

The Service handles OT and submission deduplication, middleware handles authorization, and the Endpoint handles real-time broadcasts.

## Reset data

Stop the server, then run from the repository root:

```bash
pnpm --filter @univerjs/collaboration-example-database-adapter reset
```

This deletes both the built-in and custom SQLite database files for this example. PostgreSQL data is not touched; drop the `collaboration` schema manually if you need a blank state there. The next start creates a blank document.
