# File service

English | [简体中文](./README.zh-CN.md)

A collaborative Sheet whose inserted images are uploaded through `UniverFileEndpoint`.
`UniverFileService` owns the ownership rules and expiry cleanup, and two adapters decide where
metadata and contents live. This example uses SQLite and a local directory; moving to Postgres and
S3 only replaces those two adapters.

```bash
pnpm example:file-service
```

Open <http://127.0.0.1:3010/?unit=file-service-sheet> and use **Insert → Image → Float Image**.
The upload request returns a file ID, the image is reloaded through the sign-url and download
routes after a refresh or a server restart, and a second browser on the same URL sees it too.

- `web/main.ts` configures the collaboration client with the three file URLs and registers the
  Drawing preset in collaboration mode.
- `server/main.ts` assembles the collaboration Service, Endpoint, Transport, and the File Service
  and Endpoint.

## How the client calls the file service

Set three URLs on `UniverCollaborationClientPlugin`. The image service (inserted images) and the
attachment service (file attachments) in `@univerjs-pro/collaboration-client` both use them.

```ts
uploadFileServerUrl: `${baseURL}/stream/file/upload`,
signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
downloadEndpointUrl: `${location.protocol}//${location.host}/`,
```

| Step | Request from the client | Response from the application |
| --- | --- | --- |
| Upload | `POST {uploadFileServerUrl}?size=<bytes>&source=<FileSource>&assign=<id>` with a multipart field named `file` | `{ "FileId": "<fileID>", "error": { "code": 1, "message": "" } }` |
| Resolve | `GET {signUrlServerUrl}` with `{fileID}` replaced | `{ "url": "<absolute or relative URL>", "error": { "code": 1, "message": "" } }`; a relative `url` is resolved against `downloadEndpointUrl` |
| Load | `GET` the resolved URL | The file bytes with the right `Content-Type` |

`error.code` is `ErrorCode.OK` (`1`) from `@univerjs/protocol`; any other code makes the client
reject the operation. The client keeps only the file ID in the Unit data, so a URL may change as
long as the sign-url route can still resolve the ID.

`source` is the `FileSource` enum from `@univerjs/protocol`, sent as a number:

| `source` | Sent by | `assign` | Lifecycle |
| --- | --- | --- | --- |
| `HttpImport` (`1`) | The exchange client before an import | user ID | Temporary: delete after the import finishes |
| `HttpExport` (`2`) | The application when it writes an export result | Unit ID | Temporary: delete after download or by expiry |
| `UnitEmbedded` (`3`) | The image and attachment services | Unit ID | Persistent: lives as long as the Unit |
| Anything else, including omitted | — | — | Treat as persistent |

Only one image service may be registered. The Drawing plugin ships a base64 implementation and
the collaboration client ships the uploading one; registering both fails with
`Expect 1 dependency item(s) but get 2`. With a file service, pass `collaboration: true` to
`UniverSheetsDrawingPreset` (or `override: [[IImageIoService, null]]` to `UniverDrawingPlugin`)
as this example does. Without one, keep the base64 implementation instead: pass
`override: [[IImageIoService, null]]` to `UniverCollaborationClientPlugin` and register the
Drawing plugin before the collaboration client plugins, as [`comments`](../comments/README.md)
and [`object-permissions`](../object-permissions/README.md) do.

## Where files are stored

`SQLiteFileDatabaseAdapter` writes metadata to the `collaboration_files` table in
`.data/collaboration.sqlite`, and `LocalFileBlobStore` writes contents to `.data/files/<fileID>`, so
files survive a server restart. The File Service's timer removes `HttpImport` and `HttpExport` files.

## Replace the storage and add permissions

Swapping the adapters for `@univerjs-pro/collaboration-file-database-postgres` and
`@univerjs-pro/collaboration-file-blob-s3` supports multi-node deployments. Every request in this
example is the same user and Unit permissions are not checked; a real application uses
`fileService.use("upload" | "signUrl" | "download", ...)` to check that the user may access the Unit
named by `assign`.

The [`exchange`](../exchange/README.md) and [`all-unit`](../all-unit/README.md) examples connect the
File Service the same way.
