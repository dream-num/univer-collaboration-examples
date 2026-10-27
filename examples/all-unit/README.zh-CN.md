# All Unit

[English](./README.md) | 简体中文

最简六类 Unit 协同示例：Sheet、Doc、Slide、Board、Base、PDF。服务端固定每类一个 Unit，
通过 `GET /api/units` 返回 ID、类型和展示标签，前端侧边栏展示列表并打开对应编辑器。

```bash
pnpm install
pnpm example:all-unit
```

打开 <http://127.0.0.1:3010>，将选中 Unit 的 URL 复制到另一个浏览器即可协同。
切换 Unit 使用整页导航，URL 保留选中状态，刷新或前进后退均可恢复。

- `server/units.ts`：固定列表与初始数据，仅创建缺失 Unit，重启不覆盖已有编辑。
- `server/main.ts`：SQLite、Service、Endpoint、列表接口、文件接口与演示授权。
- `server/files.ts` 与 `server/file-store.ts`：编辑器插入图片和附件时使用的上传、sign-url
  和下载接口，文件落盘到 `.data/files/<fileID>` 并带 JSON 索引。
- `web/main.ts`：加载列表、侧边栏、URL 选择与编辑器生命周期。
- `web/univer/`：六类 Unit 插件装配、主题、语言资源和
  Base Worker；只接入协同，不接入登录、成员管理、评论、历史和导入导出业务。

所有浏览器使用固定 `demo-user`，编辑权限固定允许，仅用于本地教学。侧边栏使用固定类型标签，
不随文档标题修改。SQLite 数据默认保存在 `examples/all-unit/.data/collaboration.sqlite`，
服务重启后继续保留。可通过 `HOST`、`PORT`、`DATABASE_PATH`、`FILES_PATH` 覆盖服务端配置。

插入的图片和附件通过 `POST /universer-api/stream/file/upload` 上传并返回 `FileId`，编辑器再通过
`GET /universer-api/file/:fileID/sign-url` 换取地址，从 `GET /universer-api/file/:fileID/download`
加载。前端地址在 `web/univer/features/collaboration.ts` 中配置。上传接口会记录 `source` 和
`assign` 查询参数，`source` 是 `@univerjs/protocol` 的 `FileSource` 枚举数值：`HttpImport` 和
`HttpExport` 是临时文件；其余 `source` 包括缺省值和
`UnitEmbedded` 都是持久文件，生命周期与 `assign` 指定的 Unit 相同。更详细的说明请参考
[`file-service`](../file-service/README.zh-CN.md) 示例。

```bash
pnpm --filter @univerjs/collaboration-example-all-unit typecheck
```
