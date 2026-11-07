# File service

English | [简体中文](./README.zh-CN.md)

A collaborative Sheet whose inserted images are uploaded to the application's file service and
referenced by ID from the Unit data.

## Two ways to store an image

When someone inserts an image into a Sheet, the bytes have to live somewhere. Univer supports two
places.

**Embedded in the Unit.** The Drawing plugin's default image service turns the file into a base64
data URL and writes it into the Unit data next to the drawing's position and size. The server plays
no part; this is how a standalone Univer page stores images.

**Referenced from the Unit.** The client uploads the file to the application, which stores it and
answers with a file ID. The Unit data keeps only that ID. When the image is shown, the client
exchanges the ID for a URL and the browser loads the file from there.

Embedding fits a single-user page but not collaboration, because the Unit data is exactly what
collaboration sends and stores. An embedded image rides inside a changeset that every collaborator
receives and inside every snapshot the server keeps, so a few photos turn a workbook of a few
kilobytes into megabytes that are loaded in full on every open. Attachments and server-side import
and export move whole files between browser and server, so they cannot be built on embedding at all.

The File Service and File Endpoint are the server side of the second way. The Endpoint serves the
three routes the client calls (upload, sign-url, download), the Service applies ownership rules and
permission middleware and removes expired temporary files, and two adapters decide where metadata and
contents are stored. The same routes also carry attachments and the source files and results of
server-side import and export, so one file service serves every file a Unit refers to.

## Packages

The four file packages this example uses are open source under Apache-2.0 in
[univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community).
They are published to npm under the same names and versions as the rest of the SDK.

| Package | Role in this example |
| --- | --- |
| [`@univerjs-pro/collaboration-file-service`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-service/README.md) | `UniverFileService`: ownership rules, permission middleware, and expiry cleanup of temporary files. It has no storage of its own and writes through the two adapters below. |
| [`@univerjs-pro/collaboration-file-endpoint`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-endpoint/README.md) | `UniverFileEndpoint`: the upload, sign-url, and download routes the Univer frontend calls, registered on the Transport next to the collaboration Endpoint. |
| [`@univerjs-pro/collaboration-file-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-sqlite/README.md) | `SQLiteFileDatabaseAdapter`: file metadata (`IFileDatabaseAdapter`) in the `collaboration_files` table of `.data/collaboration.sqlite`, shared with the collaboration data. |
| [`@univerjs-pro/collaboration-file-blob-local`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-local/README.md) | `LocalFileBlobStore`: file contents (`IFileBlobStore`) in `.data/files/<fileID>`. |

Metadata and content are separate contracts, so each adapter is replaced on its own.
[`collaboration-file-database-postgres`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-postgres/README.md)
and [`collaboration-file-blob-s3`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-s3/README.md)
support multi-node deployments and direct download links;
[`collaboration-file-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-memory/README.md)
implements both for tests. The built-in adapters are also the reference implementations for writing
your own against the storage the application already runs.

## Run the example

```bash
pnpm example:file-service
```

Open <http://127.0.0.1:3010/?unit=file-service-sheet> and use **Insert → Image → Float Image**.
The upload request returns a file ID, the image is reloaded through the sign-url and download
routes after a refresh or a server restart, and a second browser on the same URL sees it too.

- `web/main.ts` configures the collaboration client with the three file URLs and registers the
  Drawing preset in collaboration mode.
- `server/main.ts` assembles the collaboration Service, Endpoint, and Transport, then the File
  Service with its two adapters and the File Endpoint.

Files survive a server restart. The File Service's timer removes temporary `HttpImport` and
`HttpExport` files; images stay as long as the Unit does.

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

## Permissions and production settings

Every request in this example is the same user and Unit permissions are not checked. The File
Service does not know the application's Unit permissions; a real application installs them as
middleware with `fileService.use("upload" | "signUrl" | "download", ...)` and checks that the user
may access the Unit named by `assign`. Upload size limits, timeouts, and authentication for image
loading (cookies, bearer tokens, or direct links signed by the blob store) are options of the File
Endpoint; see the two package READMEs linked above.

The [`exchange`](../exchange/README.md) and [`all-unit`](../all-unit/README.md) examples connect the
File Service the same way.
