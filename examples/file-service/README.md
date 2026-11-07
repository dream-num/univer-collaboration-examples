# File service

English | [简体中文](./README.zh-CN.md)

A collaboration application with its own file service: files a Unit refers to are stored by the
application, and the Unit data keeps only file IDs. The demonstration is an image inserted into a
Sheet.

## Why a file service

Take images as the example. An image inserted into a Unit is stored in one of two ways:

- **Embedded.** The Drawing plugin's default image service encodes the file as base64 and writes it
  into the Unit data. The server is not involved.
- **Referenced.** The file is uploaded to the application. The Unit data records only a file ID,
  which the client exchanges for a URL when it displays the image.

An embedded image becomes part of the Unit data, so snapshots and changesets grow with it, and the
client loads all of it on every open, slowing the first render. Referencing moves the file out of
the Unit data and leaves only the ID behind.

The need is not limited to images. Attachments are stored by reference in the same way, and the
source and result files of import and export need temporary storage. The file service is the set of
routes the application provides for these files: it accepts uploads and returns a download URL for
a file ID, on storage the application chooses.

In the SDK, the File Endpoint serves the routes, the File Service applies ownership rules,
permission middleware, and temporary-file cleanup, and adapters store metadata and content.

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

## Client configuration

The client needs two things: the file URLs, and exactly one image service.

**File URLs.** Set three URLs on `UniverCollaborationClientPlugin`. The image service (inserted
images) and the attachment service (file attachments) in `@univerjs-pro/collaboration-client` both
use them.

```ts
[
  UniverCollaborationClientPlugin,
  {
    // ...collaboration URLs
    uploadFileServerUrl: `${baseURL}/stream/file/upload`,
    signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
    downloadEndpointUrl: `${location.protocol}//${location.host}/`,
  },
],
```

**Image service.** Only one implementation of `IImageIoService` may be registered. The Drawing plugin
ships the base64 one and the collaboration client ships the uploading one; registering both fails
with `Expect 1 dependency item(s) but get 2`.

With a file service, drop the base64 one, as this example does:

```ts
presets: [
  UniverSheetsCorePreset({ container: "app" }),
  UniverSheetsDrawingPreset({ collaboration: true }),
],
```

Without presets, pass the override to the Drawing plugin directly:

```ts
univer.registerPlugin(UniverDrawingPlugin, { override: [[IImageIoService, null]] });
```

Without a file service, keep the base64 one instead: drop the uploading one from the collaboration
client and register the Drawing plugin first, because the collaboration client plugins resolve the
image service at startup.

```ts
plugins: [
  UniverCollaborationPlugin,
  UniverDrawingPlugin,
  [UniverCollaborationClientPlugin, { /* ...URLs */ override: [[IImageIoService, null]] }],
  UniverCollaborationClientUIPlugin,
],
```

## Routes the client calls

The three URLs map to these requests. `UniverFileEndpoint` serves them under `/universer-api` by
default.

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

## Permissions

Every request in this example is the same user and Unit permissions are not checked. The File
Service does not know the application's Unit permissions; install them as middleware with
`fileService.use("upload" | "signUrl" | "download", ...)` and check that the user may access the
Unit named by `assign`.

## Packages

The File packages are open source under Apache-2.0 in
[univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community)
and are published to npm under the same names and versions as the rest of the SDK. The File Service
and File Endpoint are open source as well, so they can serve as the reference for an implementation
of your own.

| Package | Description |
| --- | --- |
| [`@univerjs-pro/collaboration-file-service`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-service/README.md) | `UniverFileService`: ownership rules, permission middleware, and expiry cleanup of temporary files. Reads and writes through the adapters below. |
| [`@univerjs-pro/collaboration-file-endpoint`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-endpoint/README.md) | `UniverFileEndpoint`: the upload, sign-url, and download routes, registered on the Transport next to the collaboration Endpoint. |
| [`@univerjs-pro/collaboration-file-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-sqlite/README.md) | Metadata adapter on SQLite. Used here: the `collaboration_files` table in `.data/collaboration.sqlite`, shared with the collaboration data. |
| [`@univerjs-pro/collaboration-file-database-postgres`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-postgres/README.md) | Metadata adapter on PostgreSQL. |
| [`@univerjs-pro/collaboration-file-blob-local`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-local/README.md) | Blob store in a local directory. Used here: `.data/files/<fileID>`. |
| [`@univerjs-pro/collaboration-file-blob-s3`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-s3/README.md) | Blob store on S3-compatible object storage; can sign direct download links. |
| [`@univerjs-pro/collaboration-file-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-memory/README.md) | In-process metadata adapter and blob store for tests. |

Metadata (`IFileDatabaseAdapter`) and content (`IFileBlobStore`) are separate contracts, so each
adapter is replaced on its own, and the built-in ones are the reference for adapters on the storage
the application already runs.
