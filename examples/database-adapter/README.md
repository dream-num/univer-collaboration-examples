# Database Adapter

English | [简体中文](./README.zh-CN.md)

Replaces the Memory Adapter from Quick Start with SQLite to show how collaboration data survives a service restart.

```bash
pnpm example:database-adapter
```

Open <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>. Data is written to `.data/collaboration.sqlite`, and the same Unit is loaded after another start. To clear the demo data, run `pnpm --filter @univerjs/collaboration-example-database-adapter reset`.

The default entry point, [`server/main.ts`](./server/main.ts), uses the SDK's built-in
`SQLiteDatabaseAdapter` and creates the Unit only when it does not exist.

## Custom databases

Custom implementations live in [`server/custom-database-adapter`](./server/custom-database-adapter/).
The [Memory Adapter](./server/custom-database-adapter/custom-memory-database-adapter.ts) directly implements `IDatabaseAdapter`.

The default remains the built-in SQLite Adapter. To try Memory, uncomment its import and constructor in [`server/main.ts`](./server/main.ts) and comment out the default Adapter constructor. In-memory data is lost when the process exits.
