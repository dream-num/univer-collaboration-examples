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

| Capability | Available on | Where to try it |
| --- | --- | --- |
| Real-time collaboration | Sheet, Doc, Slide, Board, Base, PDF | Open the same Unit in another browser |
| Images and attachments | Editors that support them | Insert an image; it is uploaded through the File Endpoint |
| Import and export | Sheet, Doc, Slide, Base, PDF | **File** in the ribbon's Start tab: **Open(File)** and **Save As**. Base: **File** at the right of the table toolbar. An import finishes with a notification at the bottom right whose link opens the new Unit |
| Embedded Office attachments | Sheet, Doc | Import a file with an embedded Word or Excel object, then select it to preview, download, or convert it to an online Unit |
| Comments | Sheet, Doc, Slide, Base, Board | Sheet: right-click a cell. Doc: **Insert** tab. Slide: right-click an element. Base: a record's actions. Board: the left toolbar |
| Edit history | Sheet, Doc, Slide, Base, Board | Sheet, Doc, Slide, Base: the ribbon. Board: the settings menu at the top right |

Exports use the online version of converted attachments, so edits made in the converted Unit appear in
the exported file.

Two gaps follow from the packages: the Exchange Service does not convert Boards, and Univer ships no
comment or history UI for PDF. Each feature module under `web/univer/features/` registers the UI for
the Unit types it covers and skips the rest.

PDF conversion is opt-in in `@univerjs-pro/exchange-node`: `server/main.ts` imports
`@univerjs-pro/exchange-node/pdf` and the example depends on `@univerjs-pro/exchange-pdf-node-binding`.
A PDF Unit imported from a PDF file exports with its edits. The blank `PDF` Unit in the sidebar exports
while it is empty, but once a text box is added the export fails with `source-less PDF cannot apply
imported semantic patches`: the exporter applies text edits onto a source PDF and this Unit has none.

Read these files together:

- `server/main.ts` assembles the Collaboration, File, Exchange, Comment, and History Services and
  Endpoints. They all share `.data/collaboration.sqlite`; file contents go to `.data/files`.
- `server/units.ts` defines the six Units and creates only the missing ones.
- `web/univer/mount-editor.ts` creates the editor and registers each capability for the Unit types that
  support it. Each one lives in `web/univer/features/`.
- `web/univer/units/` assembles the plugins for each Unit type.
- `web/univer/features/import-export/` holds the import and export menus, dialogs, and upload
  notifications. Univer 1.2.0 removed them from the exchange packages; this is the
  [migration example from the Univer showcase](https://office.univer.ai/showcase/sheets/custom-import-export),
  copied per Unit type with only the `en-US` and `zh-CN` locales kept. Its views use Tailwind classes
  that no Univer package ships, so `import-export/utilities.css` writes those out.

Imported and converted Units are not in the sidebar. Their links carry the type, as in
`/?unit=<id>&type=<type>`, and `shared/units.ts` builds them.

Every request is the fixed `demo-user`, and all actions are allowed. This is local teaching
configuration: login, members, and permissions are left out. See the
[`permissions`](../permissions/README.md) example for those.

Units, comments, history, and files survive restarts. Delete `.data` to start again. `HOST`, `PORT`,
`DATABASE_PATH`, and `FILES_PATH` override server defaults. Exchange tasks are process-local and
disappear when the process stops.

```bash
pnpm --filter @univerjs/collaboration-example-all-unit typecheck
```
