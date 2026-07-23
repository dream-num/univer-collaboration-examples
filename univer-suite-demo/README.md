# Univer Suite Demo（Spike）

这是基于 `univer-collaboration` 框架搭建多类型办公套件的第一阶段 spike。它验证
应用可以把产品资源模型、Express 路由、SQLite 协同持久化和 Univer 前端协议组合
在同一个服务中，而不让业务路由绕过 Endpoint。

## 当前可用

- 注册、登录、退出登录，以及 HttpOnly 进程内会话。
- 首页、最近使用、个人空间和回收站。
- 全局搜索、快捷创建和统一的新建菜单。
- 创建、打开、软删除、恢复 Sheet、Doc、Slide。
- 三种 Unit 都通过 `UniverCollabService.createUnitFromData` 创建。
- 产品资源元数据和协同数据写入同一个 SQLite 文件中的独立表。
- 用户与资源归属持久化到 SQLite，每位用户只访问自己的个人空间。
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
└── ProductStore（suite_resources）
```

创建 Unit 时先写入状态为 `creating` 的产品记录，再调用
`createUnitFromData`，成功后标记为 `active`。Service middleware 只允许这个流程
创建 Unit，并在读取、提交和应用 changeset 时确认产品资源仍为 `active` 且属于
当前 Session 的 `userId`。

删除采用产品层软删除：资源进入回收站后 middleware 拒绝访问，但协同数据仍保留，
因此可以恢复。框架目前没有永久删除 Unit 的公开生命周期，示例不直接操作 Adapter
内部表。

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
- `GET /api/units?status=active|deleted`
- `GET /api/units/:resourceID`
- `POST /api/units`
- `DELETE /api/units/:resourceID`
- `POST /api/units/:resourceID/restore`

## Spike 边界

当前只实现资源所有者隔离，尚未实现成员 ACL、共享工作空间、文件夹持久化、永久
删除，以及 Doc/Slide 的历史 UI。搜索目前在已加载的个人资源中进行。页面构建与
服务端集成测试覆盖注册登录、资源隔离、三种 Unit 的创建、History、软删除和恢复。
