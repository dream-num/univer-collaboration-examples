# Server-side import and export

English | [简体中文](./README.zh-CN.md)

A runnable Sheet collaboration example with server-side Office conversion based on
`@univerjs-pro/exchange-node`. The frontend registers `UniverExchangeClientPlugin` and
`UniverSheetsExchangeClientPlugin`, while the Express application implements the minimal exchange
protocol expected by those plugins.

```bash
pnpm example:exchange
```

Open <http://127.0.0.1:3010/?unit=exchange-sheet>. Use the **Import** / **Export** toolbar above the
editor to import XLS/XLSX/CSV/TSV as a new collaborative Unit, or to export the current confirmed
revision as XLSX/CSV/TSV. After an import the browser navigates to the newly created Unit.

SDK 1.2.0 ships `exchange-client` and `sheets-exchange-client` headless (no ribbon entries), so the
example owns the entry points: `web/main.ts` calls `importSheetToUnitIdAsync`,
`exportSheetByUnitIdAsync`, and `downloadFile` from the Facade.

Read these files together:

- `server/main.ts` assembles the collaboration Service, Endpoint, Transport, and exchange routes.
- `server/exchange.ts` implements upload, task polling, signed download, snapshot import, and exact
  current-revision snapshot export. Export reads self-contained recovery data through
  `getUnitLoadDataWithBlocks()` and completes it with `UnitSnapshotMaterializer` before conversion.
- `web/main.ts` configures the collaboration and exchange plugins.

- `server/file-store.ts` writes uploaded files and export results to `.data/files/<fileID>` with a
  JSON index of name, MIME type, size, `source`, `assign`, and creation time.

Collaboration Units are stored in `.data/collaboration.sqlite`, and files in `.data/files`; both
survive server restarts. Tasks remain process-local and disappear when the process stops. The
upload route records the `source` and `assign` query parameters that Univer clients send; `source`
is the numeric `FileSource` enum from `@univerjs/protocol`. Files with `HttpImport` (import
sources) or `HttpExport` (export results) are temporary:
the import route deletes its source file once the Unit exists, and an export result can be deleted
after download. Any other `source`, including the default, is a persistent file that shares the
lifecycle of the Unit named by `assign`. The fixed user, permissive authorization, local file
store, 25 MiB upload limit, and unsigned local download URL are teaching choices, not production
configuration. A production application should authenticate every route, authorize Unit creation
and export, use durable object storage and a task queue, enforce quotas, validate files, expire
downloads, and run conversions in isolated workers. Exchange HTTP routes belong to the application;
the Collaboration SDK does not provide an Exchange Endpoint.
