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

The Drawing preset uses the collaboration client’s image service. The Advanced preset configures the File and Exchange routes under `/universer-api` from the server origin and loads the Exchange Facade.

The example uses the following presets alongside Sheets Core.

```ts
presets: [
  UniverSheetsCorePreset({ container: "app" }),
  UniverSheetsDrawingPreset({ collaboration: true }),
  UniverSheetsAdvancedPreset({
    license: import.meta.env.UNIVER_LICENSE || undefined,
    universerEndpoint: location.origin,
    exchangeClientOptions: { minSheetRowCount: 100, minSheetColumnCount: 26 },
  }),
],
```

### Default request URLs

By default, the browser sends these requests to the page origin (`http://127.0.0.1:3010` in this example).
To use the preset with a separate backend, set `universerEndpoint` to its origin. The preset appends `/universer-api` to form the API paths.

| Plugin option | HTTP | Default path |
| --- | --- | --- |
| `uploadFileServerUrl` | POST | `/universer-api/stream/file/upload` |
| `signUrlServerUrl` | GET | `/universer-api/file/{fileID}/sign-url` |
| `importServerUrl` | POST | `/universer-api/exchange/{type}/import` |
| `exportServerUrl` | POST | `/universer-api/exchange/{type}/export` |
| `getTaskServerUrl` | GET | `/universer-api/exchange/task/{taskID}` |

After the sign-url response, the client resolves a relative download URL against `downloadEndpointUrl`, which the preset sets to the server origin followed by `/`.

### Plugin mode

Register the plugins directly to use the default URLs listed above. To override a URL, pass its option to `UniverExchangeClientPlugin`.

```ts
import { UniverExchangeClientPlugin } from "@univerjs-pro/exchange-client";
import { UniverLicensePlugin } from "@univerjs-pro/license";
import { UniverSheetsExchangeClientPlugin } from "@univerjs-pro/sheets-exchange-client";
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/sheets-exchange-client/facade";

univer.registerPlugin(UniverLicensePlugin, { license: import.meta.env.UNIVER_LICENSE || undefined });
univer.registerPlugin(UniverExchangeClientPlugin);
univer.registerPlugin(UniverSheetsExchangeClientPlugin, { minSheetRowCount: 100, minSheetColumnCount: 26 });
```

### Toolbar

Both setups expose the same Facade methods to the toolbar.

```ts
const unitId = await univerAPI.importSheetToUnitIdAsync(file);

const blob = await univerAPI.exportSheetByUnitIdAsync(unitId, ExchangeFormat.XLSX);
univerAPI.downloadFile(blob, unitId, ExchangeFormat.XLSX);
```

The Facade API, the plugin options, and how to keep the built-in menus are in
[Sheets import and export](https://docs.univer.ai/guides/sheets/features/import-export).

## Server assembly

```ts
const exchangeService = new UniverExchangeService({ collabService: service, fileService });

transport.register(endpoint);
// Exchange depends on File: register File before Exchange.
transport.register(new UniverFileEndpoint(fileService));
transport.register(new UniverExchangeEndpoint(exchangeService));
```

Conversion runs in the process through `@univerjs-pro/exchange-node`, which reads the License from
the `UNIVER_LICENSE` and `UNIVER_LICENSE_KEY` environment variables. See
[License](https://docs.univer.ai/server/import-export/license).

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
