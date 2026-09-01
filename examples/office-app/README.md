# Office App

[简体中文](./README.zh-CN.md)

A runnable, bilingual office workspace built on the public Univer Collaboration SDK. It combines
real users, a Unit list, Creator/Editor/Viewer roles, five Unit types, Sheet/Doc comments, version
history, soft delete/recovery, and local Office import/export.

## Run

From the repository root:

```bash
pnpm install
pnpm example:office-app
```

Open <http://127.0.0.1:3015>, register a user, and create a Unit or import an Office file as one. Application tables and
all Collaboration, Comment, and History adapter tables share `.data/office-app.sqlite`; each
component still owns only its own tables.

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

The installed `1.0.0-beta.2` generic History loader supports only Sheet, while the per-Unit History
UI packages are not available from the current public registry. The example therefore provides one
application-level history drawer for all five Unit types and submits restores through the public
`RevertRevisionMutation`. Replacing it with the native per-Unit preview UIs is tracked as a separate
TODO in [the design](./docs/design.md#history).

This is a teaching application, not production identity or Unit-management infrastructure. Sessions are stored
as hashes, but there is no email verification, password reset, rate limiting, object storage,
transactional outbox, or multi-process realtime fanout.

See [requirements](./docs/requirements.md), [design](./docs/design.md), and
[domain language](./CONTEXT.md).
