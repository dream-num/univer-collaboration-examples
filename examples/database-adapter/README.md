# Database Adapter

English | [简体中文](./README.zh-CN.md)

Use SQLite to persist collaboration data and load the same Unit after restarting the service.

```bash
pnpm example:database-adapter
```

Open <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>. Data is written to `.data/collaboration.sqlite`, and the same Unit is loaded after another start. To clear the stored data, stop the service and run `pnpm --filter @univerjs/collaboration-example-database-adapter reset`.

The default entry point, [`server/main.ts`](./server/main.ts), uses the SDK's built-in
`SQLiteDatabaseAdapter` and creates the Unit only when it does not exist.

Custom Adapter examples:

- [Memory](./server/custom-database-adapter/custom-memory-database-adapter.ts)
- [SQLite](./server/custom-database-adapter/custom-sqlite-database-adapter.ts)

Both custom Adapters implement the RC contract: `getSnapshotInfo` reads only snapshot metadata,
`getChangesets` returns an array or `null` for inactive Units, and omitted revision bounds are unlimited.
An explicit revision of `0` is a regular bound, not an alias for the current head.
