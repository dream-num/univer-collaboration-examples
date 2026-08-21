# 服务端导入导出

[English](./README.md) | 简体中文

基于 `@univerjs-pro/exchange-node` 的可运行 Sheet 协同与服务端 Office 转换示例。前端注册
`UniverExchangeClientPlugin` 和 `UniverSheetsExchangeClientPlugin`，Express 应用实现这两个
插件需要的最小 exchange 协议。

```bash
pnpm example:exchange
```

打开 <http://127.0.0.1:3010/?unit=exchange-sheet&type=2>。通过 **File → Open (File)** 把
XLS/XLSX/CSV/TSV 导入为新的协同 Unit；通过 **File → Save As** 把当前 confirmed revision
导出为 XLSX/CSV/TSV。导入完成通知中包含新 Unit 的链接。

建议一起阅读：

- `server/main.ts`：组装协同 Service、Endpoint、Transport 和 exchange 路由。
- `server/exchange.ts`：实现上传、任务轮询、下载 URL、snapshot 导入和当前精确 revision
  的 snapshot 导出；导出先通过 `getUnitLoadDataWithBlocks()` 读取自包含恢复数据，再用
  `UnitSnapshotMaterializer` 补全后交给转换器。
- `web/main.ts`：配置协同与 exchange 前端插件。

文件、任务、Unit 和 Memory Adapter 都只保存在当前进程，进程停止后全部丢失。固定用户、
全允许授权、内存文件存储、25 MiB 上传限制以及未签名的本地下载 URL 都只用于教学，不是生产
配置。生产应用应认证所有路由、校验 Unit 创建和导出权限，使用持久对象存储与任务队列，设置
配额、校验文件、让下载 URL 过期，并在隔离 worker 中执行转换。Exchange HTTP 路由属于应用，
Collaboration SDK 不提供 Exchange Endpoint。
