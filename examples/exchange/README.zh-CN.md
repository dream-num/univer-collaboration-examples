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

Drawing preset 使用协同客户端的图片服务。Advanced preset 根据服务端 origin 配置 `/universer-api` 下的 File 与 Exchange 路由，并加载 Exchange Facade。

示例在 Sheets Core 之外注册这两个 preset。

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

### 默认请求地址

浏览器默认向当前页面的源地址发送以下请求，本地示例为 `http://127.0.0.1:3010`。如果后端独立部署，将 `universerEndpoint` 设为后端的源地址，preset 会自动拼接 `/universer-api` 前缀。

| 插件配置项 | HTTP | 默认路径 |
| --- | --- | --- |
| `uploadFileServerUrl` | POST | `/universer-api/stream/file/upload` |
| `signUrlServerUrl` | GET | `/universer-api/file/{fileID}/sign-url` |
| `importServerUrl` | POST | `/universer-api/exchange/{type}/import` |
| `exportServerUrl` | POST | `/universer-api/exchange/{type}/export` |
| `getTaskServerUrl` | GET | `/universer-api/exchange/task/{taskID}` |

拿到 sign-url 响应后，客户端使用 `downloadEndpointUrl` 补全相对下载地址。preset 将它设为服务端源地址加 `/`。

### 插件模式

如果应用按插件组装 Univer，可以安装与当前 Univer 版本一致的 License、Exchange Client 和 Sheets Exchange Client 包，在已有的 `univer` 实例上注册插件，并加载两个 Facade 模块。使用 Advanced preset 时，它会完成这些注册。

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

插件模式使用相同的默认请求路径。需要自定义某条路由时，在注册 `UniverExchangeClientPlugin` 时传入对应配置项即可，例如 `{ getTaskServerUrl: "/api/tasks/{taskID}" }`。

可运行的插件模式示例见 `all-unit`。它在[客户端配置](../all-unit/web/univer/config.ts)中用 `exchangeClientConfig` 集中定义 File 和 Exchange 地址，在 [Sheet 装配入口](../all-unit/web/univer/units/sheet/index.ts)调用 `univer.registerPlugin(UniverExchangeClientPlugin, exchangeClientConfig)`，再注册 Sheets Exchange 客户端。为支持表格内嵌的 Word 文件和编辑器内的导入导出菜单，`all-unit` 还分别注册了 Docs Exchange 客户端和自定义菜单插件。

### 工具栏

两种配置下，工具栏都可以调用相同的 Facade 方法。

```ts
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
