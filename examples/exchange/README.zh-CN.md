# 服务端导入导出

[English](./README.md) | 简体中文

基于 `@univerjs-pro/exchange-node` 的可运行 Sheet 协同与服务端 Office 转换示例。前端注册
`UniverExchangeClientPlugin` 和 `UniverSheetsExchangeClientPlugin`，Express 应用实现这两个
插件需要的最小 exchange 协议。

```bash
pnpm example:exchange
```

打开 <http://127.0.0.1:3010/?unit=exchange-sheet>。使用编辑器上方的 **Import** / **Export**
工具栏，把 XLS/XLSX/CSV/TSV 导入为新的协同 Unit，或把当前 confirmed revision 导出为
XLSX/CSV/TSV。导入完成后浏览器会跳转到新建的 Unit。

SDK 1.2.0 的 `exchange-client` 与 `sheets-exchange-client` 只提供 headless 能力（不再带
ribbon 入口），所以入口由示例自己提供：`web/main.ts` 调用 Facade 的
`importSheetToUnitIdAsync`、`exportSheetByUnitIdAsync` 和 `downloadFile`。

建议一起阅读：

- `server/main.ts`：组装协同 Service、Endpoint、Transport 和 exchange 路由。
- `server/exchange.ts`：实现上传、任务轮询、下载 URL、snapshot 导入和当前精确 revision
  的 snapshot 导出；导出先通过 `getUnitLoadDataWithBlocks()` 读取自包含恢复数据，再用
  `UnitSnapshotMaterializer` 补全后交给转换器。
- `web/main.ts`：配置协同与 exchange 前端插件。
- `server/file-store.ts`：把上传文件和导出结果写入 `.data/files/<fileID>`，并用 JSON 索引记录
  文件名、MIME、大小、`source`、`assign` 和创建时间。

协同 Unit 写入 `.data/collaboration.sqlite`，文件写入 `.data/files`，服务重启后都会保留。
`exchange-sheet` 的初始内容只在首次创建 Unit 时写入；要从空库重新开始，先停止服务，再运行
`pnpm --filter @univerjs/collaboration-example-exchange reset` 删除 `.data`。任务仍只存在于当前进程，
进程停止后会丢失。上传接口会记录 Univer 客户端带上的 `source` 和 `assign`
查询参数，`source` 是 `@univerjs/protocol` 的 `FileSource` 枚举数值。`HttpImport`（导入源文件）
和 `HttpExport`（导出结果）是临时文件：导入
完成后源文件会被删除，导出结果下载后即可删除；其余 `source` 包括缺省值都是持久文件，生命周期
与 `assign` 指定的 Unit 相同。文件接口的更详细说明请参考
[`file-service`](../file-service/README.zh-CN.md) 示例。Exchange HTTP 路由属于应用，
Collaboration SDK 不提供 Exchange Endpoint。
