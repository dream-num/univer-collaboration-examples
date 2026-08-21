# Server-side import and export

English | [简体中文](./README.zh-CN.md)

A runnable Sheet collaboration example with server-side Office conversion based on
`@univerjs-pro/exchange-node`. The frontend registers `UniverExchangeClientPlugin` and
`UniverSheetsExchangeClientPlugin`, while the Express application implements the minimal exchange
protocol expected by those plugins.

```bash
pnpm example:exchange
```

Open <http://127.0.0.1:3010/?unit=exchange-sheet&type=2>. Use **File → Open (File)** to import
XLS/XLSX/CSV/TSV as a new collaborative Unit, or **File → Save As** to export the current confirmed
revision as XLSX/CSV/TSV. The import notification contains a link to the newly created Unit.

Read these files together:

- `server/main.ts` assembles the collaboration Service, Endpoint, Transport, and exchange routes.
- `server/exchange.ts` implements upload, task polling, signed download, snapshot import, and exact
  current-revision snapshot export. Export reads self-contained recovery data through
  `getUnitLoadDataWithBlocks()` and completes it with `UnitSnapshotMaterializer` before conversion.
- `web/main.ts` configures the collaboration and exchange plugins.

Files, tasks, Units, and the Memory Adapter are all process-local and disappear when the process
stops. The fixed user, permissive authorization, in-memory file store, 25 MiB upload limit, and
unsigned local download URL are teaching choices, not production configuration. A production
application should authenticate every route, authorize Unit creation and export, use durable object
storage and a task queue, enforce quotas, validate files, expire downloads, and run conversions in
isolated workers. Exchange HTTP routes belong to the application; the Collaboration SDK does not
provide an Exchange Endpoint.
