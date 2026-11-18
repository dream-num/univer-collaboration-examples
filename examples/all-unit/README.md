# All Unit

English | [简体中文](./README.zh-CN.md)

The other examples each show one capability. `all-unit` assembles them in a single application, so you
can see how they fit together: six Unit types, file storage, server-side import and export, embedded
Office attachments, comments, and edit history.

```bash
pnpm install
pnpm example:all-unit
```

Open <http://127.0.0.1:3010> and switch Units in the sidebar.

- **New Unit**: choose Sheet, Doc, Slide, Board, Base, or PDF, enter a name, and create it.
- **Import**: opens the file picker and imports the selected file immediately. Excel, CSV, and TSV
  become Sheet Units; Word, PowerPoint, and PDF become Doc, Slide, and PDF Units. A successful import
  opens the new Unit. Stopping the wait does not cancel a conversion already started on the server.
- The sidebar lists the newest Units first, with ties sorted by Unit ID in ascending order.
  It refreshes when the page loads or you return to the tab. Edits update a Unit's modification time
  without changing its list position.

| Capability | Available on | Where to try it |
| --- | --- | --- |
| Real-time collaboration | Sheet, Doc, Slide, Board, Base, PDF | Open the same Unit in another browser |
| Images and attachments | Editors that support them | Insert an image; it is uploaded through the File Endpoint |
| Import and export | Sheet, Doc, Slide, Base, PDF | **File** in the ribbon's Start tab: **Open(File)** and **Save As**. Base: **File** at the right of the table toolbar. An import finishes with a notification at the bottom right whose link opens the new Unit |
| Embedded Office attachments | Sheet, Doc | Import a file with an embedded Word or Excel object, then select it to preview, download, or convert it to an online Unit |
| Comments | Sheet, Doc, Slide, Base, Board | Sheet: right-click a cell. Doc: **Insert** tab. Slide: right-click an element. Base: a record's actions. Board: the left toolbar |
| Edit history | Sheet, Doc, Slide, Base, Board | Sheet, Doc, Slide, Base: the ribbon. Board: the settings menu at the top right |
| Print | Sheet, Doc, Slide, Board, PDF | **Print** in the ribbon's Start tab; Board: the settings menu at the top right |

Exports use the online version of converted attachments, so edits made in the converted Unit appear in
the exported file.

Two gaps follow from the packages: the Exchange Service does not convert Boards, and Univer ships no
comment or history UI for PDF. Each `web/univer/units/<type>/index.ts` registers what its Unit type
has and says what it lacks.

PDF conversion is opt-in in `@univerjs-pro/exchange-node`: `server/main.ts` imports
`@univerjs-pro/exchange-node/pdf` and the example depends on `@univerjs-pro/exchange-pdf-node-binding`.
A PDF Unit imported from a PDF file exports with its edits. The blank `PDF` Unit in the sidebar can
also export inserted images and text boxes, including image moves and text edits.

Read these files together:

- `server/main.ts` assembles the Collaboration, File, Exchange, Comment, and History Services and
  Endpoints. They all share `.data/collaboration.sqlite`. File contents go to `.data/files`.
- `server/units.ts` defines the six default Units and the blank content used for new Units.
- `server/unit-routes.ts` serves the Unit list and creation endpoints.
- `server/database/unit-catalog.ts` reads Unit names and modification times from SQLite.
- `web/app.tsx` assembles the React page, with sidebar and dialog components in `web/ui/`.
- `web/api/import.ts` uploads files and waits for results through the File and Exchange Endpoints.
- `web/univer/mount-editor.ts` creates the Univer instance with the plugins every Unit type shares, then
  hands over to the Unit type's module.
- `web/univer/units/<type>/index.ts` registers that Unit type's plugins from top to bottom: editor,
  comments, collaboration client, history, print, and import/export. `web/univer/config.ts` holds the
  server routes they share.
- `web/univer/import-export/` holds the import and export menus, dialogs, and upload
  notifications. Univer 1.2.0 removed them from the exchange packages; this is the
  [migration example from the Univer showcase](https://office.univer.ai/showcase/sheets/custom-import-export),
  copied per Unit type with only the `en-US` and `zh-CN` locales kept. Its views use Tailwind classes
  that no Univer package ships, so `import-export/utilities.css` writes those out.

Unit links carry the type, as in `/?unit=<id>&type=<type>`. Copy a link to another browser to collaborate.

The current editor's `univer` and `univerAPI` are on `window` for the browser console.

Every request is the fixed `demo-user`, and all actions are allowed. This is local teaching
configuration: login, members, and permissions are left out. See the
[`permissions`](../permissions/README.md) example for those.

Units, comments, history, and files survive restarts. Delete `.data` to start again. `HOST`, `PORT`,
`DATABASE_PATH`, and `FILES_PATH` override server defaults. Exchange tasks are process-local and
disappear when the process stops.

```bash
pnpm --filter @univerjs/collaboration-example-all-unit typecheck
```
