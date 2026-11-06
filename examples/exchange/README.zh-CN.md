# 服务端导入导出

[English](./README.md) | 简体中文

基于 `@univerjs-pro/exchange-node` 的可运行 Sheet 协同与服务端 Office 转换示例。前端注册
`UniverExchangeClientPlugin` 和 `UniverSheetsExchangeClientPlugin`，服务端用
`UniverExchangeEndpoint` 和 `UniverFileEndpoint` 提供这两个插件调用的路由。

```bash
pnpm example:exchange
```

打开 <http://127.0.0.1:3010/?unit=exchange-sheet>。使用编辑器上方的 **Import** / **Export**
工具栏，把 XLS/XLSX/CSV/TSV 导入为新的协同 Unit，或把当前 confirmed revision 导出为
XLSX/CSV/TSV。导入完成后浏览器会跳转到新建的 Unit。

自 SDK 1.2.0 起，`exchange-client` 与 `sheets-exchange-client` 只提供 headless 能力（不再带
ribbon 入口），所以入口由示例自己提供：`web/main.ts` 调用 Facade 的
`importSheetToUnitIdAsync`、`exportSheetByUnitIdAsync` 和 `downloadFile`。

建议一起阅读：

- `server/main.ts`：组装协同、File 和 Exchange 的 Service 与 Endpoint。文件元数据和协同数据共用
  `.data/collaboration.sqlite`，文件内容写入 `.data/files`。
- `web/main.ts`：配置协同与 exchange 前端插件。

协同 Unit、文件元数据和文件内容都保留在 `.data`，服务重启后仍在。`exchange-sheet` 的初始内容只在
首次创建 Unit 时写入；要从空库重新开始，先停止服务，再运行
`pnpm --filter @univerjs/collaboration-example-exchange reset` 删除 `.data`。任务只存在于当前进程，
进程停止后会丢失。导入的源文件在任务结束时删除；导出结果是临时文件，由 File Service 的过期清理删除。
文件接口的更详细说明请参考 [`file-service`](../file-service/README.zh-CN.md) 示例。
