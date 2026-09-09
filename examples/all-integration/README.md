# All Integration Example

[简体中文](./README.zh-CN.md)

A runnable, bilingual example combining multiple Univer Collaboration SDK capabilities: user
authentication, a Unit list, Creator/Editor/Viewer roles, five Unit types, comments, version history,
soft delete/recovery, and local Office import/export.

Use it to learn and reference SDK integration. It does not cover every SDK capability or serve as a
production application template.

## Run

From the repository root:

```bash
pnpm install
pnpm example:all-integration
```

Open <http://127.0.0.1:3015>, register a user, and create a Unit or import an Office file as one. Application tables and
all Collaboration, Comment, and History adapter tables share `.data/office-app.sqlite`; each
component still owns only its own tables. The database filename is retained from the former
`office-app` name to preserve existing local data.

## Source layout

```text
src/
├── client/          React shell, pages, Univer setup, and locales
├── server/          Express composition and feature-oriented server modules
│   ├── auth/        Session authentication
│   ├── units/       Unit metadata, members, content, and lifecycle
│   ├── collaboration/  SDK services, endpoints, ACL, and History indexing
│   └── exchange/    Local Office import/export
└── shared/          Small API and Unit contracts shared by both sides
```

The example deliberately keeps feature folders flat. Routes translate HTTP, services coordinate a
use case, and repositories own application SQL; there is no DI container, ORM, or generic domain
layer to learn before following the SDK integration.

## Capability matrix

| Capability | Sheet | Doc | Slide | Board | Base |
| --- | --- | --- | --- | --- | --- |
| Create, collaborate, history | Yes | Yes | Yes | Yes | Yes |
| Thread Comments | Yes | Yes | No | No | No |
| Import | XLS/XLSX/CSV/TSV | DOC/DOCX | PPT/PPTX | No | XLS/XLSX/CSV/TSV |
| Export | XLSX/CSV/TSV | DOCX | PPTX | No | XLSX/CSV/TSV |

History indexing uses `historyService.attach(collabService)`. This is intentionally a small,
process-local convenience setup: a process crash between a Collaboration commit and History index
write can leave an indexing gap. Production deployments should use a transactional outbox and the
explicit History indexing APIs.

The example registers the native History UI plugin for each Unit type: Sheet, Doc, Slide, Board,
and Base. These plugins connect to `UniverHistoryEndpoint` through `historyServerUrl`.

This is a teaching application, not production identity or Unit-management infrastructure. Sessions are stored
as hashes, but there is no email verification, password reset, rate limiting, object storage,
transactional outbox, or multi-process realtime fanout.
