# Server-side import and export

English | [简体中文](./README.zh-CN.md)

A collaborative Sheet whose server imports Office files as collaborative Units and exports Units as
files.

## Run the example

```bash
pnpm example:exchange
```

Open <http://127.0.0.1:3010/?unit=exchange-sheet>. The **Import** / **Export** toolbar above the
editor imports XLS, XLSX, CSV, or TSV as a new collaborative Unit and exports the current confirmed
revision as XLSX or CSV. After an import the browser navigates to the new Unit.

- `server/main.ts` assembles the collaboration, File, and Exchange Services and Endpoints.
- `web/main.ts` configures the collaboration and exchange plugins and provides the toolbar.

Units, file metadata, and file contents live in `.data` and survive a restart;
`pnpm --filter @univerjs/collaboration-example-exchange reset` deletes it. Tasks live in the process
and are gone after a restart.

## How it works

Import and export are tasks: the client creates one, then polls it until it is done or failed. Both
go through the File Service.

| | Client | Server |
| --- | --- | --- |
| Import | Uploads the source file to the File upload route, calls the import route with the file ID, polls the task | Converts the file, creates the Unit through the collaboration Service, reports the new Unit ID |
| Export | Calls the export route with the Unit ID and format, polls the task, resolves the result file ID through sign-url, downloads it | Reads the Unit, converts it, stores the result as a temporary file, reports the file ID |

The source file is deleted when its task ends; results stay until the File Service's expiry cleanup
removes them. This is why the example assembles the File Service next to Exchange.

## Client configuration

`UniverExchangeClientPlugin` takes six URLs: three exchange routes and the three File URLs it shares
with the collaboration client.

```ts
[
  UniverExchangeClientPlugin,
  {
    importServerUrl: `${baseURL}/exchange/{type}/import`,
    exportServerUrl: `${baseURL}/exchange/{type}/export`,
    getTaskServerUrl: `${baseURL}/exchange/task/{taskID}`,
    uploadFileServerUrl: `${baseURL}/stream/file/upload`,
    signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
    downloadEndpointUrl: `${location.protocol}//${location.host}/`,
  },
],
[UniverSheetsExchangeClientPlugin, { minSheetRowCount: 100, minSheetColumnCount: 26 }],
```

`UniverSheetsExchangeClientPlugin` sets the minimum row and column count of an imported worksheet.

Since SDK 1.2.0 the exchange packages are headless, with no ribbon entries. The application provides
the entry points and calls the Facade:

```ts
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/sheets-exchange-client/facade";

const unitId = await univerAPI.importSheetToUnitIdAsync(file);

const blob = await univerAPI.exportSheetByUnitIdAsync(unitId, ExchangeFormat.XLSX, sheetId);
univerAPI.downloadFile(blob, unitId, ExchangeFormat.XLSX);
```

`sheetId` names the worksheet for CSV, which holds one worksheet; XLSX ignores it.

## Server assembly

```ts
const exchangeService = new UniverExchangeService({ collabService: service, fileService });

transport.register(endpoint);
// File first: the Transport disposes in reverse order, so Exchange is released before File.
transport.register(new UniverFileEndpoint(fileService));
transport.register(new UniverExchangeEndpoint(exchangeService));
```

Conversion runs in the process through `@univerjs-pro/exchange-node`, which reads the License from
the `UNIVER_LICENSE` and `UNIVER_LICENSE_KEY` environment variables. See
[License](https://docs.univer.ai/server/license).

Every request in this example is the same user and Unit permissions are not checked. Install them as
middleware with `exchangeService.use("import" | "export", ...)`.

## Packages

The Exchange Service and Endpoint are open source under Apache-2.0 in
[univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community),
published to npm under the same names and versions as the rest of the SDK. Use them as they are, or
take the source as the reference for your own.

| Package | Description |
| --- | --- |
| [`@univerjs-pro/collaboration-exchange-service`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-exchange-service/README.md) | `UniverExchangeService`: request validation, ownership, permission middleware, and tasks. Converts through `exchange-node`, creates and reads Units through the collaboration Service, stores files through the File Service. |
| [`@univerjs-pro/collaboration-exchange-endpoint`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-exchange-endpoint/README.md) | `UniverExchangeEndpoint`: the import, export, and task routes. |

The File packages are listed in the [`file-service`](../file-service/README.md) example.

The conversion itself is closed source. `@univerjs-pro/exchange-node` converts between Office files
and Univer data and decides which formats are supported; `@univerjs-pro/exchange-client` and
`@univerjs-pro/sheets-exchange-client` are its client side. Flow, permissions, and storage are
customized in the Service and Endpoint; the conversion is not.
