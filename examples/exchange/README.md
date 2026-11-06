# Server-side import and export

English | [简体中文](./README.zh-CN.md)

A runnable Sheet collaboration example with server-side Office conversion based on
`@univerjs-pro/exchange-node`. The frontend registers `UniverExchangeClientPlugin` and
`UniverSheetsExchangeClientPlugin`, and the server serves the routes they call with
`UniverExchangeEndpoint` and `UniverFileEndpoint`.

```bash
pnpm example:exchange
```

Open <http://127.0.0.1:3010/?unit=exchange-sheet>. Use the **Import** / **Export** toolbar above the
editor to import XLS/XLSX/CSV/TSV as a new collaborative Unit, or to export the current confirmed
revision as XLSX/CSV. After an import the browser navigates to the newly created Unit.

Since SDK 1.2.0, `exchange-client` and `sheets-exchange-client` ship headless (no ribbon entries), so
the example owns the entry points: `web/main.ts` calls `importSheetToUnitIdAsync`,
`exportSheetByUnitIdAsync`, and `downloadFile` from the Facade.

Read these files together:

- `server/main.ts` assembles the collaboration, File, and Exchange Services and Endpoints. File
  metadata shares `.data/collaboration.sqlite` with the collaboration data; contents go to
  `.data/files`.
- `web/main.ts` configures the collaboration and exchange plugins.

Collaboration Units, file metadata, and file contents stay in `.data` and survive server restarts.
The initial content of `exchange-sheet` is written only when the Unit is first created; to start from a
blank database, stop the server and run
`pnpm --filter @univerjs/collaboration-example-exchange reset`, which deletes `.data`. Tasks are
process-local and disappear when the process stops. Import sources are deleted when the task ends;
export results are temporary files that the File Service's expiry cleanup removes. See the
[`file-service`](../file-service/README.md) example for a fuller description of the file routes.
