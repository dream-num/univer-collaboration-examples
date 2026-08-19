# Database Adapter

English | [简体中文](./README.zh-CN.md)

Replaces the Memory Adapter from Quick Start with SQLite to show how collaboration data survives a service restart.

```bash
pnpm example:database-adapter
```

Open <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>. Data is written to `.data/collaboration.sqlite`, and the same Unit is loaded after another start. To clear the demo data, run `pnpm --filter @univerjs/collaboration-example-database-adapter reset`.

Read only `server/main.ts` alongside Quick Start: the main change is replacing the Memory Adapter with SQLite and creating the Unit once when it does not exist.
