# Univer Workspace Demo（Spike）

这是基于 `univer-collaboration` 框架搭建多类型办公套件的第一阶段 spike。它验证
应用可以把产品资源模型、Express 路由、SQLite 协同持久化和 Univer 前端协议组合
在同一个服务中，而不让业务路由绕过 Endpoint。

## 当前可用

- 注册、登录、退出登录，以及 HttpOnly 进程内会话。
- 首页、最近使用、个人空间、团队空间、与我共享和回收站。
- 全局搜索、快捷创建和统一的新建菜单。
- 个人空间与团队空间使用同一套文件夹层级、面包屑和递归回收站。
- 任意用户可以创建团队空间；团队角色为唯一 `owner`、`admin`、`editor`、
  `viewer`。
- `owner` 可以邀请和设置所有非 Owner 角色；`admin` 只能管理
  `editor/viewer`，不能修改或移除其他管理员。
- 创建、打开、协同重命名、软删除、恢复 Sheet、Doc、Slide。
- 三种 Unit 都通过 `UniverCollabService.createUnitFromData` 创建。
- 产品资源元数据和协同数据写入同一个 SQLite 文件中的独立表。
- 用户、空间、目录节点、团队成员和个人文档定向分享成员持久化到 SQLite。
- 所有者可按用户授予 `editor/viewer`、调整角色或移除成员；被邀请者可从
  “与我共享”进入内容。
- 团队内容由空间拥有并统一继承团队角色，不存在文档级权限覆盖。`admin` 可以删除
  和恢复内容，`editor` 可以创建及编辑但不能删除，`viewer` 只读。
- 不支持公开、匿名或“知道链接即可访问”的分享链接；URL 仅用于定位，所有请求均
  重新验证登录身份和空间成员权限。
- 登录用户下的 snapshot、changeset、WebSocket 和 presence 协议入口。
- Sheet、Doc、Slide 的 History 元数据索引与持久化协议。
- Sheet 编辑器中的 Univer Edit History UI。
- Sheet 编辑器使用 grid Ribbon 和高级数据/UI 插件；多类型编辑器不额外创建
  Formula、Pivot 或 History Worker。
- Sheet、Doc、Slide 按 URL 中的 Unit type 动态加载对应编辑器。
- Creator 可以在个人或团队 Scope 创建 Worktree；个人 Worktree 只对 Creator 可见，
  团队 Worktree 可选择仅 Creator 或当前团队成员可见。
- Worktree 可以引用当前用户可编辑的现有 Unit，也可以创建仅存在于 Worktree 的
  Sheet、Doc、Slide；本地 Unit 只在 merge 成功后激活为产品资源。
- `#/worktrees` 提供只读 Review 页面，显示 trunk、draft 和 merge preview，并支持
  ready、reopen、merge、discard 生命周期操作。
- Worktree 内容读取、提交、ready 和逐 Unit merge 都实时复核产品 ACL；visibility
  只控制发现与 Review，不授予 Unit 权限。
- Worktree 创建、加入 Unit 和本地 Unit 创建使用 SQLite operation journal；
  启动时恢复半程操作，并补齐已提交 merge/discard 的产品侧状态。

Board 和 Base 暂未显示创建入口，因为 alpha.7 协同包没有从公开入口导出对应 data
transformer。Doc 和 Slide 已保存 History 元数据，但 alpha.7 viewer 仅支持 Sheet，
因此暂不展示可视化历史入口。相关证据和后续方向见
[`docs/issues`](../../docs/issues/README.md)。

## 启动

要求 Node.js 24 和 pnpm。

```bash
pnpm install
pnpm example:univer-workspace
```

然后打开 `http://127.0.0.1:3020`。运行数据保存在
`examples/univer-workspace-demo/.data/univer-workspace-demo.sqlite`。

登录页提供两个可直接点击的预设账号：

| username | password |
| --- | --- |
| `alice` | `alice-password` |
| `bob` | `bob-password` |

服务启动时会幂等创建这两个账号，并恢复约定密码。每个账号首次登录时创建唯一的
个人空间。

重置示例数据：

```bash
pnpm --filter @univerjs/collaboration-example-univer-workspace reset
```

## 架构

```text
Browser
├── /api/*                 Express 产品与 Worktree API
│   └── WorkspaceWorktreeApplication
│       ├── WorkspaceWorktreeCatalog（SQLite）
│       └── ProductStore
└── /universer-api/*       Node Transport
    ├── UniverHistoryEndpoint
    │     └── UniverHistoryService
    │           └── SQLiteHistoryDatabaseAdapter
    ├── UniverCollabWorktreeEndpoint
    │     └── UniverCollabWorktreeService
    │           └── SQLiteWorktreeDatabaseAdapter
    └── UniverCollabEndpoint
          └── UniverCollabService
                └── SQLiteDatabaseAdapter

Express 产品 API
├── AuthService + UserStore（workspace_users）
└── ProductStore
    ├── workspace_spaces + workspace_space_members
    ├── workspace_nodes + workspace_units
    ├── workspace_node_members
    └── workspace_node_recents

WorkspaceWorktreeCatalog
├── workspace_worktrees + workspace_worktree_units
├── workspace_staged_resources
└── workspace_worktree_operations
```

个人空间和团队空间共用 `workspace_nodes` 目录树；`parent_id = NULL` 表示空间根目录。
团队内容的有效权限从空间 Owner 或 `workspace_space_members` 实时计算，个人文档则由
个人空间 Owner 和可选的定向 `workspace_node_members` 计算。团队文档没有独立成员表，
因此不会产生空间角色和文档角色冲突。

创建 Unit 时先在目标空间目录中写入状态为 `creating` 的产品节点，再调用
`createUnitFromData`，成功后标记为 `active`。Service middleware 只允许这个流程
创建 Unit，并在读取、提交和应用 changeset 时确认产品节点仍为 `active`，且当前
Session 拥有有效空间或文档角色。`viewer` 的提交会在 Service middleware 中被拒绝，
不能依赖前端只读状态保障安全；协议兼容 Authz API 同时把角色映射为 Univer
`UnitAction`。Sheet 前端还设置本地 `WorkbookEditablePermission`，提供明确的只读
体验。

重命名通过对应 Unit 类型的协同 mutation 提交；changeset confirmed 后，
`changesetCommitted` 事件把名称同步到产品资源表。因此名称修改会进入协同版本与
History，文件列表不需要另建一套独立的重命名状态。

删除文件夹时以递归 CTE 将整棵子树软删除，协同 middleware 立即拒绝访问，但
snapshot 与 changeset 仍保留；恢复根文件夹时一并恢复子树。删除会清除相关用户的
最近打开记录，恢复后不会自动重新进入最近列表。

最近使用按用户记录实际打开行为，不复用资源的 `updated_at`。编辑器初始化前调用
`POST /api/units/:resourceID/open`，服务端在确认当前用户仍可访问资源后更新时间；
`GET /api/units?scope=recent` 查询时也会重新校验资源状态和成员权限。资源被删除或
共享被撤销时会清除对应记录，恢复或重新分享后不会在用户未打开的情况下自动回到
最近列表。

History 是 confirmed changeset 的最终一致派生索引。Workspace Demo 使用
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
- `GET /api/spaces`
- `POST /api/spaces`
- `GET /api/spaces/:spaceID/nodes?parentID=<folderID>`
- `GET /api/spaces/:spaceID/trash`
- `POST /api/spaces/:spaceID/folders`
- `PATCH /api/folders/:folderID`
- `DELETE /api/nodes/:nodeID`
- `POST /api/nodes/:nodeID/restore`
- `GET /api/spaces/:spaceID/members`
- `POST /api/spaces/:spaceID/members`
- `PATCH /api/spaces/:spaceID/members/:userID`
- `DELETE /api/spaces/:spaceID/members/:userID`
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
- `GET /api/worktrees?view=<active|processed>`
- `POST /api/worktrees`
- `GET /api/worktrees/:worktreeID`
- `PATCH /api/worktrees/:worktreeID`
- `POST /api/worktrees/:worktreeID/units`
- `POST /api/worktrees/:worktreeID/units/new`
- `POST /api/worktrees/:worktreeID/units/:unitID/submit_changesets`
- `POST /api/worktrees/:worktreeID/ready`
- `POST /api/worktrees/:worktreeID/reopen`
- `POST /api/worktrees/:worktreeID/merge`
- `POST /api/worktrees/:worktreeID/discard`

## Spike 边界

当前不包含公开链接、匿名访问、组织/群组同步、团队所有权转移、节点移动、永久删除，
以及 Doc/Slide 的历史 UI。个人空间暂只支持单个文档定向分享，不支持分享整个个人
文件夹。搜索在当前页面已加载的目录或资源中进行。集成测试覆盖个人目录、团队四角色
边界、管理员越权拒绝、个人文档定向分享、三种 Unit、History、递归删除和恢复。
