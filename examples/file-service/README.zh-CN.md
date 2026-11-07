# 文件服务

[English](./README.md) | 简体中文

一个接入了文件服务的协同应用：Unit 引用的文件由应用保存，Unit 数据只记录文件 ID。本示例以 Sheet 中插入
的图片演示。

## 为什么需要文件服务

以图片为例。插入 Unit 的图片有两种保存方式：

- **内嵌。** Drawing 插件默认的图片服务把文件编码为 base64，直接写入 Unit 数据，服务端不参与。
- **引用。** 文件上传到应用保存，Unit 数据只记录文件 ID，显示时客户端用 ID 换取 URL。

内嵌的图片成为 Unit 数据的一部分，快照和 changeset 随之膨胀，客户端每次打开都要全量加载，首屏变慢。引用方式
把文件移出 Unit 数据，只留下 ID。

这个需求不限于图片。附件同样以引用方式保存，导入导出的源文件和结果文件也需要临时存放。文件服务就是应用为这些
文件提供的一组路由：接收上传，按文件 ID 返回下载地址，存储位置由应用决定。

在 SDK 中，File Endpoint 提供路由，File Service 执行归属规则、权限中间件和临时文件清理，adapter 负责元数据和
内容的存储。

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

## 客户端配置

客户端需要两样东西：文件 URL，以及唯一的一份图片服务。

**文件 URL。** 在 `UniverCollaborationClientPlugin` 上设置三个 URL。`@univerjs-pro/collaboration-client`
里的图片服务（插入的图片）和附件服务（文件附件）都使用它们。

```ts
[
  UniverCollaborationClientPlugin,
  {
    // ...协同相关 URL
    uploadFileServerUrl: `${baseURL}/stream/file/upload`,
    signUrlServerUrl: `${baseURL}/file/{fileID}/sign-url`,
    downloadEndpointUrl: `${location.protocol}//${location.host}/`,
  },
],
```

**图片服务。** `IImageIoService` 只能注册一份实现。Drawing 插件自带 base64 实现，协同客户端自带上传实现；
两份都注册会报 `Expect 1 dependency item(s) but get 2`。

接了文件服务时去掉 base64 实现，本示例的写法：

```ts
presets: [
  UniverSheetsCorePreset({ container: "app" }),
  UniverSheetsDrawingPreset({ collaboration: true }),
],
```

不用 preset 时，直接给 Drawing 插件传 override：

```ts
univer.registerPlugin(UniverDrawingPlugin, { override: [[IImageIoService, null]] });
```

没有文件服务时反过来保留 base64 实现：去掉协同客户端的上传实现，并把 Drawing 插件注册在前面，因为协同
客户端插件在启动时就会解析图片服务。

```ts
plugins: [
  UniverCollaborationPlugin,
  UniverDrawingPlugin,
  [UniverCollaborationClientPlugin, { /* ...URL */ override: [[IImageIoService, null]] }],
  UniverCollaborationClientUIPlugin,
],
```

## 客户端调用的路由

三个 URL 对应下面三个请求，`UniverFileEndpoint` 默认挂在 `/universer-api` 下提供。

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

## 权限

本示例所有请求都是同一个用户，没有检查 Unit 权限。File Service 不知道应用的 Unit 权限，通过
`fileService.use("upload" | "signUrl" | "download", ...)` 以中间件的形式接入，检查用户是否有权访问
`assign` 指定的 Unit。

## 相关的包

File 相关的包都在
[univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community)
以 Apache-2.0 开源，发布到 npm 时与 SDK 其余部分使用相同的包名和版本号。File Service 和 File Endpoint 同样
开源，可作为自行实现时的参考。

| 包 | 说明 |
| --- | --- |
| [`@univerjs-pro/collaboration-file-service`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-service/README.zh-CN.md) | `UniverFileService`：归属规则、权限中间件、临时文件的过期清理，通过下面的 adapter 读写。 |
| [`@univerjs-pro/collaboration-file-endpoint`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-endpoint/README.zh-CN.md) | `UniverFileEndpoint`：上传、sign-url、下载三条路由，和协同 Endpoint 一起注册在 Transport 上。 |
| [`@univerjs-pro/collaboration-file-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-sqlite/README.zh-CN.md) | SQLite 元数据 adapter。本示例使用：写在 `.data/collaboration.sqlite` 的 `collaboration_files` 表，与协同数据同库。 |
| [`@univerjs-pro/collaboration-file-database-postgres`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-database-postgres/README.zh-CN.md) | PostgreSQL 元数据 adapter。 |
| [`@univerjs-pro/collaboration-file-blob-local`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-local/README.zh-CN.md) | 本地目录 blob store。本示例使用：`.data/files/<fileID>`。 |
| [`@univerjs-pro/collaboration-file-blob-s3`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-blob-s3/README.zh-CN.md) | S3 兼容对象存储的 blob store，可签发直链下载。 |
| [`@univerjs-pro/collaboration-file-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-file-memory/README.zh-CN.md) | 内存实现的元数据 adapter 和 blob store，用于测试。 |

元数据（`IFileDatabaseAdapter`）和内容（`IFileBlobStore`）是两份独立的契约，adapter 可以各自替换；内置实现
也是对接应用已有存储时的参考。
