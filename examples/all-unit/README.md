# All Unit

English | [简体中文](./README.zh-CN.md)

Minimal collaboration for five fixed Units: Sheet, Doc, Slide, Board, and Base.
The server returns their IDs, types, and display labels from `GET /api/units`.
The browser lists them in a sidebar and opens the selected editor.

```bash
pnpm install
pnpm example:all-unit
```

Open <http://127.0.0.1:3010> and copy a Unit's URL to another browser to collaborate.
Switching Units navigates to a new page; the selected Unit is preserved in the URL.

- `server/units.ts`: fixed catalog and initial snapshots; only missing Units are created.
- `server/main.ts`: SQLite, Service, Endpoint, HTTP list, and demo authorization.
- `web/main.ts`: list loading, sidebar, URL selection, and editor lifecycle.
- `web/univer/`: editor assembly copied from `all-integration`, including the five Unit
  plugin sets, themes, locales, and Base Worker. Only collaboration is wired to the
  backend; login, member management, comments, history, and exchange are omitted.

Each browser uses the fixed `demo-user` identity and allows all editor actions. This is
local teaching configuration. Sidebar names are fixed type labels, not synchronized document titles.
SQLite data lives in `examples/all-unit/.data/collaboration.sqlite` and survives restarts.
`HOST`, `PORT`, and `DATABASE_PATH` override server defaults. Pro features use the same
license requirements as `all-integration`; set `UNIVER_LICENSE` before building if needed.

```bash
pnpm --filter @univerjs/collaboration-example-all-unit typecheck
pnpm --filter @univerjs/collaboration-example-all-unit test
```

The test loads all five snapshot types and verifies an edit survives closing and reopening SQLite.

With SDK `1.0.0-rc.0`, the Slide toolbar may show “Local file” despite active
collaboration. Two-browser slide insertion and SQLite persistence were verified;
this example preserves the upstream status component.
