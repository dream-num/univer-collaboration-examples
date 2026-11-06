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
revision as XLSX/CSV/TSV. After an import the browser navigates to the newly created Unit.

Since SDK 1.2.0, `exchange-client` and `sheets-exchange-client` ship headless (no ribbon entries), so
the example owns the entry points: `web/main.ts` calls `importSheetToUnitIdAsync`,
`exportSheetByUnitIdAsync`, and `downloadFile` from the Facade.

Read these files together:

- `server/main.ts` assembles the collaboration, File, and Exchange Services and Endpoints. File
  metadata shares `.data/collaboration.sqlite` with the collaboration data; contents go to
  `.data/files`.
- `web/main.ts` configures the collaboration and exchange plugins.

Collaboration Units, file metadata, and file contents stay in `.data` and survive server restarts.
The seed text in `exchange-sheet` is written only when the Unit is first created; to start from a
blank database, stop the server and run
`pnpm --filter @univerjs/collaboration-example-exchange reset`, which deletes `.data`. Tasks are
process-local and disappear when the process stops. Import sources are deleted when the task ends;
export results are temporary files that the File Service's expiry cleanup removes. See the
[`file-service`](../file-service/README.md) example for a fuller description of the file routes.

## OLE attachments and images

Files embedded in Office documents (OLE objects) import as file icons on the canvas. Clicking an icon
shows a toolbar: preview, download, convert to online, rename, delete. **Export XLSX** embeds the
originals from the import; **Export XLSX (online attachments)** embeds the current confirmed content
of converted attachments. Imported images and attachments are stored as files of the Unit, and the
snapshot keeps only their file IDs.

To try it, import `fixtures/sheet-with-word.xlsx` (a Word document embedded in Excel) with **Import**.

The frontend changes carry `OLE:` comments: registering the drawing plugins with `ole.getLink`,
configuring the file URLs on the collaboration client, opening `&type=1` Docs (the online documents
that conversion creates), and the button that exports online versions.
