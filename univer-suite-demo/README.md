# Univer Suite Demo（Spike）

这是基于 `univer-collaboration` 框架搭建多类型办公套件的第一阶段 spike。它验证
应用可以把产品资源模型、Express 路由、SQLite 协同持久化和 Univer 前端协议组合
在同一个服务中，而不让业务路由绕过 Endpoint。

## 当前可用

- 注册、登录、退出登录，以及 HttpOnly 进程内会话。
- 首页、最近使用、个人空间、与我共享和回收站。
- 全局搜索、快捷创建和统一的新建菜单。
- 创建、打开、协同重命名、软删除、恢复 Sheet、Doc、Slide。
- 三种 Unit 都通过 `UniverCollabService.createUnitFromData` 创建。
- 产品资源元数据和协同数据写入同一个 SQLite 文件中的独立表。
- 用户、资源归属和定向分享成员持久化到 SQLite。
- 所有者可按用户授予 `editor/viewer`、调整角色或移除成员；被邀请者可从
  “与我共享”进入内容。
- `editor` 可以编辑和恢复历史，`viewer` 可以读取和查看历史；分享、删除和成员
  管理只允许所有者操作。
- 登录用户下的 snapshot、changeset、WebSocket 和 presence 协议入口。
- Sheet、Doc、Slide 的 History 元数据索引与持久化协议。
- Sheet 编辑器中的 Univer Edit History UI。
- Sheet、Doc、Slide 按 URL 中的 Unit type 动态加载对应编辑器。

Board 和 Base 暂未显示创建入口，因为 alpha.6 协同包没有从公开入口导出对应 data
transformer。Doc 和 Slide 已保存 History 元数据，但 alpha.6 viewer 仅支持 Sheet，
因此暂不展示可视化历史入口。相关证据和后续方向见
[`docs/issues`](../../docs/issues/README.md)。

## 启动

要求 Node.js 24 和 pnpm。

```bash
pnpm install
pnpm example:univer-suite
```

然后打开 `http://127.0.0.1:3020`。运行数据保存在
`examples/univer-suite-demo/.data/univer-suite-demo.sqlite`。

登录页提供两个可直接点击的预设账号：

| username | password |
| --- | --- |
| `alice` | `alice-password` |
| `bob` | `bob-password` |

服务启动时会幂等创建这两个账号，并恢复约定密码。两个账号的个人资源彼此隔离。

重置示例数据：

```bash
pnpm --filter @univerjs/collaboration-example-univer-suite reset
```

## 架构

```text
Browser
├── /api/*                 Express 产品 API
└── /universer-api/*       Node Transport
    ├── UniverHistoryEndpoint
    │     └── UniverHistoryService
    │           └── SQLiteHistoryDatabaseAdapter
    └── UniverCollabEndpoint
          └── UniverCollabService
                └── SQLiteDatabaseAdapter

Express 产品 API
├── AuthService + UserStore（suite_users）
└── ProductStore（suite_resources + suite_resource_members + suite_resource_recents）
```

创建 Unit 时先写入状态为 `creating` 的产品记录，再调用
`createUnitFromData`，成功后标记为 `active`。Service middleware 只允许这个流程
创建 Unit，并在读取、提交和应用 changeset 时确认产品资源仍为 `active`，且当前
Session 是所有者或受邀成员。`viewer` 的提交会在 Service middleware 中被拒绝，
不能依赖前端只读状态保障安全；协议兼容 Authz API 同时把角色映射为 Univer
`UnitAction`。Sheet 前端还设置本地 `WorkbookEditablePermission`，提供明确的只读
体验。

重命名通过对应 Unit 类型的协同 mutation 提交；changeset confirmed 后，
`changesetCommitted` 事件把名称同步到产品资源表。因此名称修改会进入协同版本与
History，文件列表不需要另建一套独立的重命名状态。

删除采用产品层软删除：资源进入回收站后 middleware 拒绝访问，但协同数据仍保留，
因此可以恢复。框架目前没有永久删除 Unit 的公开生命周期，示例不直接操作 Adapter
内部表。

最近使用按用户记录实际打开行为，不复用资源的 `updated_at`。编辑器初始化前调用
`POST /api/units/:resourceID/open`，服务端在确认当前用户仍可访问资源后更新时间；
`GET /api/units?scope=recent` 查询时也会重新校验资源状态和成员权限。资源被删除或
共享被撤销时会清除对应记录，恢复或重新分享后不会在用户未打开的情况下自动回到
最近列表。

History 是 confirmed changeset 的最终一致派生索引。Suite Demo 使用
`historyService.attach(collabService)` 接入，并通过 History middleware 复用资源
所有者检查；删除后的资源不能读取历史，恢复后重新可用。框架默认的 History
分段间隔为 60 秒，本示例通过 `DefaultHistoryPolicy` 配置为 5 秒，便于快速观察
多个版本。

## 产品 API

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/capabilities`
- `GET /api/users?query=<keyword>`
- `GET /api/units?status=active|deleted`
- `GET /api/units?scope=shared`
- `GET /api/units?scope=recent`
- `GET /api/units/:resourceID`
- `POST /api/units/:resourceID/open`
- `PATCH /api/units/:resourceID`
- `POST /api/units`
- `DELETE /api/units/:resourceID`
- `POST /api/units/:resourceID/restore`
- `GET /api/units/:resourceID/members`
- `POST /api/units/:resourceID/members`
- `PATCH /api/units/:resourceID/members/:userID`
- `DELETE /api/units/:resourceID/members/:userID`

## Spike 边界

当前的 ACL 是按用户定向分享，不包含公开链接、匿名访问、共享工作空间或群组权限；
也尚未实现文件夹持久化、永久删除，以及 Doc/Slide 的历史 UI。已连接客户端的权限
变更仍遵循当前 SDK 的重连/后续请求边界。搜索目前在当前列表资源中进行。页面构建与
服务端集成测试覆盖注册登录、资源隔离、分享角色、服务端 viewer 拒绝、三种 Unit 的
创建、History、软删除和恢复。
