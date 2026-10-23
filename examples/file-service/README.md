# File service

English | [简体中文](./README.zh-CN.md)

A collaborative Sheet whose inserted images are uploaded to the application's own file service.
The Collaboration SDK does not provide a file Endpoint: the three HTTP routes the Univer client
calls, and the storage behind them, belong to the application. This example implements them with
Express and the local disk so you can copy the shape and replace the storage.

```bash
pnpm example:file-service
```

Open <http://127.0.0.1:3010/?unit=file-service-sheet> and use **Insert → Image → Float Image**.
The upload request returns a file ID, the image is reloaded through the sign-url and download
routes after a refresh or a server restart, and a second browser on the same URL sees it too.

- `web/main.ts` configures the collaboration client with the three file URLs and registers the
  Drawing preset in collaboration mode.
- `server/files.ts` implements the upload, sign-url, and download routes.
- `server/file-store.ts` stores file bytes under `.data/files/<fileID>` and metadata in
  `.data/files/index.json`, and documents which uploads are temporary.
- `server/main.ts` assembles the collaboration Service, Endpoint, Transport, and the file routes.

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

## What the application stores

`FileStore` writes the bytes to `.data/files/<fileID>` and keeps `fileName`, `contentType`,
`size`, `source`, `assign`, and `createdAt` in `.data/files/index.json`, so files survive a
server restart. Uploads are limited to 25 MiB and the download URL is unsigned. These are teaching
choices; no cleanup task is implemented.

## Replace it with your own file service

Keep the three routes and move the bytes to object storage, with the metadata, including
`source` and `assign`, in a database table keyed by file ID. Have the sign-url route return a
time-limited signed URL, point `downloadEndpointUrl` at the storage or CDN origin, and
authenticate the file routes, checking that the user may read the Unit named by `assign`.

The [`exchange`](../exchange/README.md) and [`all-unit`](../all-unit/README.md) examples embed the
same `FileStore` and routes next to their own features.
