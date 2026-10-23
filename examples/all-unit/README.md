# All Unit

English | [简体中文](./README.zh-CN.md)

Minimal collaboration for six fixed Units: Sheet, Doc, Slide, Board, Base, and PDF.
The server returns their IDs, types, and display labels from `GET /api/units`.
The browser lists them in a sidebar and opens the selected editor.

```bash
pnpm install
pnpm example:all-unit
```

Open <http://127.0.0.1:3010> and copy a Unit's URL to another browser to collaborate.
Switching Units navigates to a new page; the selected Unit is preserved in the URL.

- `server/units.ts`: fixed catalog and initial snapshots; only missing Units are created.
- `server/main.ts`: SQLite, Service, Endpoint, HTTP list, file routes, and demo authorization.
- `server/files.ts` and `server/file-store.ts`: the upload, sign-url, and download routes the
  editors use for images and attachments, backed by `.data/files/<fileID>` plus a JSON index.
- `web/main.ts`: list loading, sidebar, URL selection, and editor lifecycle.
- `web/univer/`: editor assembly for the six Unit types, including plugins, themes,
  locales, and Base Worker. Only collaboration is wired to the
  backend; login, member management, comments, history, and exchange are omitted.

Each browser uses the fixed `demo-user` identity and allows all editor actions. This is
local teaching configuration. Sidebar names are fixed type labels, not synchronized document titles.
SQLite data lives in `examples/all-unit/.data/collaboration.sqlite` and survives restarts.
`HOST`, `PORT`, `DATABASE_PATH`, and `FILES_PATH` override server defaults.

Inserted images and attachments are uploaded to `POST /universer-api/stream/file/upload`, which
returns a `FileId`; the editor then resolves it through `GET /universer-api/file/:fileID/sign-url`
and loads `GET /universer-api/file/:fileID/download`. The client URLs are set in
`web/univer/features/collaboration.ts`. The upload records the `source` and `assign` query
parameters; `source` is the numeric `FileSource` enum from `@univerjs/protocol`. `HttpImport` and
`HttpExport` files are temporary, while any other `source`, including
the default and `UnitEmbedded`, is persistent and shares the lifecycle of the Unit named by
`assign`. This example keeps files on the local disk with an unsigned download URL for teaching; a
production application should store them in object storage, return time-limited signed URLs, and
authorize every file route. Set `UNIVER_LICENSE`
before building when a license is required for Pro features.

```bash
pnpm --filter @univerjs/collaboration-example-all-unit typecheck
```
