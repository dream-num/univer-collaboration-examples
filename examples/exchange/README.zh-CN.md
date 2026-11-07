# 服务端导入导出

[English](./README.md) | 简体中文

一个协同 Sheet，服务端把 Office 文件导入为协同 Unit，把 Unit 导出为文件。

## 运行示例

```bash
pnpm example:exchange
```

打开 <http://127.0.0.1:3010/?unit=exchange-sheet>。编辑器上方的 **Import** / **Export** 工具栏把 XLS、XLSX、
CSV、TSV 导入为新的协同 Unit，把当前 confirmed revision 导出为 XLSX 或 CSV。导入完成后浏览器跳转到新 Unit。

- `server/main.ts`：组装协同、File、Exchange 的 Service 与 Endpoint。
- `web/main.ts`：配置协同与 exchange 插件，提供工具栏。

Unit、文件元数据和文件内容都在 `.data`，服务重启后仍在；`pnpm --filter @univerjs/collaboration-example-exchange reset`
删除它。任务只在进程内，重启后不再可查。

## 工作方式

导入和导出都是任务：客户端创建任务，然后轮询直到完成或失败。两者都经过 File Service。

| | 客户端 | 服务端 |
| --- | --- | --- |
| 导入 | 把源文件上传到 File 的上传路由，带文件 ID 调用导入路由，轮询任务 | 转换文件，通过协同 Service 创建 Unit，返回新 Unit ID |
| 导出 | 带 Unit ID 和格式调用导出路由，轮询任务，用结果文件 ID 走 sign-url 下载 | 读取 Unit，转换，结果存为临时文件，返回文件 ID |

源文件在任务结束时删除；结果文件保留到 File Service 的过期清理删除。这就是示例在 Exchange 之外还要组装
File Service 的原因。

## 客户端配置

`UniverExchangeClientPlugin` 需要六个 URL：三条 exchange 路由，以及与协同客户端共用的三个 File URL。

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

`UniverSheetsExchangeClientPlugin` 设置导入后工作表的最小行数和列数。

工具栏由示例自己提供，按钮调用 Facade API：

```ts
import "@univerjs-pro/exchange-client/facade";
import "@univerjs-pro/sheets-exchange-client/facade";

const unitId = await univerAPI.importSheetToUnitIdAsync(file);

const blob = await univerAPI.exportSheetByUnitIdAsync(unitId, ExchangeFormat.XLSX);
univerAPI.downloadFile(blob, unitId, ExchangeFormat.XLSX);
```

Facade API、插件选项以及如何保留内置菜单见
[Sheets 导入导出](https://docs.univer.ai/zh-CN/guides/sheets/features/import-export)。

## 服务端组装

```ts
const exchangeService = new UniverExchangeService({ collabService: service, fileService });

transport.register(endpoint);
// Exchange depends on File: register File before Exchange.
transport.register(new UniverFileEndpoint(fileService));
transport.register(new UniverExchangeEndpoint(exchangeService));
```

转换在进程内通过 `@univerjs-pro/exchange-node` 完成，它从环境变量 `UNIVER_LICENSE` 和 `UNIVER_LICENSE_KEY`
读取 License，见[许可证](https://docs.univer.ai/zh-CN/server/import-export/license)。

本示例所有请求都是同一个用户，没有检查 Unit 权限。通过 `exchangeService.use("import" | "export", ...)`
以中间件的形式接入。

## 相关的包

Exchange 的 Service 和 Endpoint 在
[univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community)
以 Apache-2.0 开源，发布到 npm 时与 SDK 其余部分使用相同的包名和版本号。可以直接使用，也可以参考源码实现
自己的定制。

| 包 | 说明 |
| --- | --- |
| [`@univerjs-pro/collaboration-exchange-service`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-exchange-service/README.zh-CN.md) | `UniverExchangeService`：请求校验、归属、权限中间件和任务。通过 `exchange-node` 转换，通过协同 Service 创建和读取 Unit，通过 File Service 存取文件。 |
| [`@univerjs-pro/collaboration-exchange-endpoint`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-exchange-endpoint/README.zh-CN.md) | `UniverExchangeEndpoint`：导入、导出、任务三条路由。 |

File 相关的包见 [`file-service`](../file-service/README.zh-CN.md) 示例。

转换本身是闭源的。`@univerjs-pro/exchange-node` 负责 Office 文件与 Univer 数据之间的转换，并决定支持哪些格式；
`@univerjs-pro/exchange-client` 和 `@univerjs-pro/sheets-exchange-client` 是它的客户端。流程、权限和存储在
Service 与 Endpoint 中定制，转换不可定制。
