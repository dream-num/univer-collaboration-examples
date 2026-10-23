# 文件服务

[English](./README.md) | 简体中文

一个协同 Sheet，插入的图片上传到应用自己的文件服务。Collaboration SDK 不提供文件 Endpoint：
Univer 客户端调用的三条 HTTP 路由和背后的存储都属于应用。本示例用 Express 和本地磁盘实现它们，
你可以照搬接口形状，再换掉存储。

```bash
pnpm example:file-service
```

打开 <http://127.0.0.1:3010/?unit=file-service-sheet>，使用 **Insert → Image → Float Image**。
上传请求返回文件 ID；刷新页面或重启服务后，图片通过 sign-url 和下载路由重新加载；另一个浏览器
打开同一 URL 也能看到。

- `web/main.ts`：在协同客户端上配置三个文件 URL，并以协同模式注册 Drawing preset。
- `server/files.ts`：实现上传、sign-url 和下载三条路由。
- `server/file-store.ts`：把文件内容写到 `.data/files/<fileID>`，元数据写到
  `.data/files/index.json`，并注释说明哪些上传是临时文件。
- `server/main.ts`：组装协同 Service、Endpoint、Transport 和文件路由。

## 客户端如何调用文件服务

在 `UniverCollaborationClientPlugin` 上设置三个 URL。`@univerjs-pro/collaboration-client` 里的
图片服务（插入的图片）和附件服务（文件附件）都使用它们。

```ts
uploadFileServerUrl: `${baseURL}/stream/file/upload`,
signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
downloadEndpointUrl: `${location.protocol}//${location.host}/`,
```

| 步骤 | 客户端请求 | 应用响应 |
| --- | --- | --- |
| 上传 | `POST {uploadFileServerUrl}?size=<字节数>&source=<FileSource>&assign=<id>`，multipart 字段名 `file` | `{ "FileId": "<fileID>", "error": { "code": 1, "message": "" } }` |
| 换取地址 | `GET {signUrlServerUrl}`，`{fileID}` 替换为文件 ID | `{ "url": "<绝对或相对 URL>", "error": { "code": 1, "message": "" } }`；相对 `url` 基于 `downloadEndpointUrl` 解析 |
| 加载 | `GET` 解析后的 URL | 文件内容，带正确的 `Content-Type` |

`error.code` 用 `@univerjs/protocol` 的 `ErrorCode.OK`（`1`）；其他值会让客户端判定操作失败。
Unit 数据里只保存文件 ID，所以只要 sign-url 路由还能解析这个 ID，URL 本身可以变。

`source` 是 `@univerjs/protocol` 的 `FileSource` 枚举，以数字发送：

| `source` | 发送方 | `assign` | 生命周期 |
| --- | --- | --- | --- |
| `HttpImport`（`1`） | exchange 客户端在导入前上传 | 用户 ID | 临时：导入完成后删除 |
| `HttpExport`（`2`） | 应用写入导出结果时 | Unit ID | 临时：下载后或过期后删除 |
| `UnitEmbedded`（`3`） | 图片服务和附件服务 | Unit ID | 持久：与 Unit 同生命周期 |
| 其他值，包括缺省 | — | — | 按持久文件处理 |

图片服务只能注册一份。Drawing 插件自带 base64 实现，协同客户端自带上传实现；两份都注册会报
`Expect 1 dependency item(s) but get 2`。接了文件服务时，像本示例一样给 `UniverSheetsDrawingPreset`
传 `collaboration: true`（或给 `UniverDrawingPlugin` 传 `override: [[IImageIoService, null]]`）。
没有文件服务时反过来保留 base64 实现：给 `UniverCollaborationClientPlugin` 传
`override: [[IImageIoService, null]]`，并把 Drawing 插件注册在协同客户端插件之前，参见
[`comments`](../comments/README.zh-CN.md) 和 [`object-permissions`](../object-permissions/README.zh-CN.md)。

## 应用保存什么

`FileStore` 把内容写到 `.data/files/<fileID>`，把 `fileName`、`contentType`、`size`、`source`、
`assign`、`createdAt` 写到 `.data/files/index.json`，服务重启后文件仍在。上传限制 25 MiB，下载
地址未签名。这些都是教学取舍，示例没有实现清理任务。

## 替换为自己的文件服务

保留这三条路由，把文件内容换成对象存储，元数据（含 `source` 和 `assign`）放进以文件 ID 为键的
数据库表。sign-url 路由返回带时效的签名地址，`downloadEndpointUrl` 指向存储或 CDN 的源站，并对
文件接口做鉴权，检查用户是否有权读取 `assign` 指定的 Unit。

[`exchange`](../exchange/README.zh-CN.md) 和 [`all-unit`](../all-unit/README.zh-CN.md) 示例在各自
功能旁边内嵌了同一份 `FileStore` 和路由。
