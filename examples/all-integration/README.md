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
all Collaboration, Comment, and History adapter tables share `.data/collaboration.sqlite`; each
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

## Capability matrix

| Capability | Sheet | Doc | Slide | Board | Base |
| --- | --- | --- | --- | --- | --- |
| Create, collaborate, history | Yes | Yes | Yes | Yes | Yes |
| Thread Comments | Yes | Yes | Yes | Yes | Yes |
| Import | XLS/XLSX/CSV/TSV | DOC/DOCX | PPT/PPTX | No | XLS/XLSX/CSV/TSV |
| Export | XLSX/CSV/TSV | DOCX | PPTX | No | XLSX/CSV/TSV |
