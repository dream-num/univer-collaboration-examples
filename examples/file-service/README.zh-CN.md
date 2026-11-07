# 文件服务

[English](./README.md) | 简体中文

一个协同 Sheet，插入的图片由应用自己的文件服务保存，而不是存在 Unit 数据里。

## 为什么应用需要文件服务

协同以 changeset 和快照的形式保存 Unit。二进制文件不属于这条数据流：插入到 Unit 里的图片和附件，
以及服务端导入导出的源文件和结果文件。Univer 客户端把它们上传到应用提供的 HTTP 路由，Unit 数据里只
保留一个文件 ID，显示或下载时再向同一组路由换取 URL。

没有文件服务时，Drawing 插件会把图片以 base64 嵌进 Unit 数据。演示够用，但每张图片都会撑大协同存储
和传输的快照与 changeset，服务端导入导出也没有地方传文件。File Service 和 File Endpoint 把这组路由
建在应用自己掌控的存储之上，同一套文件同时服务图片、附件和导入导出。

## 相关的包

本示例用到的四个文件相关的包都已在
[univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community)
以 Apache-2.0 开源，发布到 npm 时与 SDK 其余部分使用相同的包名和版本号。

| 包 | 在本示例中的角色 |
| --- | --- |
| [`@univerjs-pro/collaboration-file-service`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-service/README.zh-CN.md) | `UniverFileService`：归属规则、权限中间件、临时文件的过期清理。它自己不存数据，通过下面两个 adapter 读写。 |
| [`@univerjs-pro/collaboration-file-endpoint`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-endpoint/README.zh-CN.md) | `UniverFileEndpoint`：Univer 前端调用的上传、sign-url、下载三条路由，和协同 Endpoint 一起注册在 Transport 上。 |
| [`@univerjs-pro/collaboration-file-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-sqlite/README.zh-CN.md) | `SQLiteFileDatabaseAdapter`：文件元数据（`IFileDatabaseAdapter`），写在 `.data/collaboration.sqlite` 的 `collaboration_files` 表，与协同数据同库。 |
| [`@univerjs-pro/collaboration-file-blob-local`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-local/README.zh-CN.md) | `LocalFileBlobStore`：文件内容（`IFileBlobStore`），写在 `.data/files/<fileID>`。 |

元数据和内容是两份独立的契约，adapter 可以各自替换。
[`collaboration-file-database-postgres`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-postgres/README.zh-CN.md)
和 [`collaboration-file-blob-s3`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-s3/README.zh-CN.md)
支持多节点部署和直链下载；
[`collaboration-file-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-memory/README.zh-CN.md)
同时实现两份契约，用于测试。内置 adapter 也是参考实现，可照着对接应用已有的存储。

## 运行示例

```bash
pnpm example:file-service
```

打开 <http://127.0.0.1:3010/?unit=file-service-sheet>，使用 **Insert → Image → Float Image**。
上传请求返回文件 ID；刷新页面或重启服务后，图片通过 sign-url 和下载路由重新加载；另一个浏览器
打开同一 URL 也能看到。

- `web/main.ts`：在协同客户端上配置三个文件 URL，并以协同模式注册 Drawing preset。
- `server/main.ts`：组装协同 Service、Endpoint、Transport，再组装 File Service、它的两个 adapter 和
  File Endpoint。

文件在服务重启后仍在。File Service 的定时清理只删除临时的 `HttpImport` 和 `HttpExport` 文件，图片与
Unit 同生命周期。

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

## 权限与生产配置

本示例所有请求都是同一个用户，没有检查 Unit 权限。File Service 不知道应用的 Unit 权限，真实应用用
`fileService.use("upload" | "signUrl" | "download", ...)` 以中间件的形式接入，检查用户是否有权访问
`assign` 指定的 Unit。上传大小限制、超时，以及图片加载的鉴权方式（Cookie、Bearer token，或由 blob
store 签发的直链）都是 File Endpoint 的选项，见上面链接的两个包的 README。

[`exchange`](../exchange/README.zh-CN.md) 和 [`all-unit`](../all-unit/README.zh-CN.md) 示例用同样的方式
接入 File Service。
