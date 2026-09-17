# All Unit

[English](./README.md) | 简体中文

最简五类 Unit 协同示例：Sheet、Doc、Slide、Board、Base。服务端固定每类一个 Unit，
通过 `GET /api/units` 返回 ID、类型和展示标签，前端侧边栏展示列表并打开对应编辑器。

```bash
pnpm install
pnpm example:all-unit
```

打开 <http://127.0.0.1:3010>，将选中 Unit 的 URL 复制到另一个浏览器即可协同。
切换 Unit 使用整页导航，URL 保留选中状态，刷新或前进后退均可恢复。

- `server/units.ts`：固定列表与初始数据，仅创建缺失 Unit，重启不覆盖已有编辑。
- `server/main.ts`：SQLite、Service、Endpoint、列表接口与演示授权。
- `web/main.ts`：加载列表、侧边栏、URL 选择与编辑器生命周期。
- `web/univer/`：复制自 `all-integration` 的五类 Unit 插件装配、主题、语言资源和
  Base Worker；只接入协同，不接入登录、成员管理、评论、历史和导入导出业务。

所有浏览器使用固定 `demo-user`，编辑权限固定允许，仅用于本地教学。侧边栏使用固定类型标签，
不随文档标题修改。SQLite 数据默认保存在 `examples/all-unit/.data/collaboration.sqlite`，
服务重启后继续保留。可通过 `HOST`、`PORT`、`DATABASE_PATH` 覆盖服务端配置。
Pro 功能与 `all-integration` 使用相同的 license 要求，需要时在构建前设置 `UNIVER_LICENSE`。

```bash
pnpm --filter @univerjs/collaboration-example-all-unit typecheck
pnpm --filter @univerjs/collaboration-example-all-unit test
```

测试覆盖五类 snapshot 加载，以及编辑内容在关闭、重新打开 SQLite 后仍然保留。

在 SDK `1.0.0-rc.0` 下，Slide 工具栏可能显示 “Local file”，但实际协同仍然工作。
已验证新增幻灯片实时同步到另一页面，并写入 SQLite；此示例保留上游状态组件。
