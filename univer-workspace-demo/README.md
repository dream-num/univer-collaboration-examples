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
- 创建、打开、软删除、恢复 Sheet、Doc、Slide、Board、Base。
- Sheet、Doc、Slide 通过 `UniverCollabService.createUnitFromData` 创建；Board、Base
  暂由 Demo 生成空白 revision-1 协议 snapshot，再调用低层 `createUnit`。
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
- 浏览器编辑器按 Univer Pro 协同示例装配：Sheet 提供高级数据功能与评论；Doc
  提供 Drawing、Chart、Table、List、Shape、Callout、Code、Quote、Column、LaTeX、
  Hyperlink、评论、导入和打印；Slide 提供 Drawing、Chart、Table、导入和打印；
  Board 提供 Ink、Chart、Mind Map、Table、LaTeX 和导入；Base 使用官方核心组合。
  多类型编辑器不额外创建 Formula、Pivot 或 History Worker。
- 五种 Unit 按 URL 中的 Unit type 动态加载对应编辑器；Base 使用独立 Vite Worker
  承载 RPC 与公式远端模型。
- Creator 可以在个人或团队 Scope 创建 Worktree；个人 Worktree 只对 Creator 可见，
  团队 Worktree 可选择仅 Creator 或当前团队成员可见。
- Worktree 可以引用当前用户可编辑的现有 Unit，也可以创建仅存在于 Worktree 的
  Sheet、Doc、Slide、Board、Base；本地 Unit 只在 merge 成功后激活为产品资源。
- `#/worktrees` 提供只读 Review 页面，显示 trunk、draft 和 merge preview，并支持
  ready、reopen、merge、discard 生命周期操作；侧栏智能工作台入口显示正在进行与
  待确认的任务总数，没有待处理任务时不显示徽标。
- Worktree 内容读取、提交、ready 和逐 Unit merge 都实时复核产品 ACL；visibility
  只控制发现与 Review，不授予 Unit 权限。
- Worktree 创建、加入 Unit 和本地 Unit 创建使用 SQLite operation journal；
  启动时恢复半程操作，并补齐已提交 merge/discard 的产品侧状态。

Board 和 Base 的临时 snapshot 编码器只支持 Demo 创建的空白初始数据，并集中位于
`server/temporary-unit-snapshot.ts`。升级到包含
[univer-pro PR #5259](https://github.com/dream-num/univer-pro/pull/5259) 的发布版本后，
应删除该文件并把两类 Unit 切回 `createUnitFromData`。alpha.7 中 Board 没有公开的协同
重命名 mutation，Base 重命名也不是简单名称 mutation，因此这两类 Unit 暂以产品目录
名称为权威；编辑器标题不会用 snapshot 内的旧名称覆盖它。Sheet、Doc、Slide 的重命名
仍进入协同版本与 History。

Base 的浏览器主线程和 Base Vite Worker 都注册 Base 模型；协同 Service 的 Node RPC
Worker 也注册 `UniverRemoteBasesPlugin`，因此首次 Base 修改可以在主线程和 Worker
之间完成公式与 JSON1 数据同步。alpha.7 的 Collaboration Client UI 公式守卫会把未指定
类型取得的 Base 当成 Workbook，并直接调用 `getSheetBySheetId`。Demo 在 Base 模型加入
Instance Service 前临时补充一个返回 `null` 的同名 resolver，同时关闭 Base 不需要的
Docs 协同 UI；该 shim 不覆盖 SDK 已有实现。升级到公式守卫只处理 Sheet、或 SDK 为
非 Workbook Unit 提供类型安全分支的版本后，应删除
`src/units/base-compatibility.ts`、`WorkspaceUniverInstanceService` 及对应测试。

浏览器插件清单与服务端 Runtime 清单有意不同。服务端严格采用 universer 后面的
Univer Pro ApplyHost headless 组合，只注册 mutation replay、resource snapshot 和 OT
所需插件；Board Chart、Exchange、Print 及所有 UI 插件不会因为客户端启用而加入服务端。
当前 Demo 仍不提供素材库、附件存储、上传或签名 URL 服务，因此依赖远程文件 IO 的
图片/附件流程不属于本次对齐范围。

Worktree 的 `not-behind` 合入预览直接复用只读 draft：此时 Trunk 自创建 Worktree 后没有
变化，合入结果与 AI 修改版相同。只有 Trunk 已前进时才使用服务端生成的 merge preview
snapshot；冲突仍保持不可预览。

Doc 和 Slide 已保存 History 元数据，但 alpha.7 viewer 仅支持 Sheet，因此暂不展示
可视化历史入口。相关证据和后续方向见
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

创建 Unit 时先在目标空间目录中写入状态为 `creating` 的产品节点。Sheet、Doc、Slide
调用 `createUnitFromData`，Board、Base 调用带初始 snapshot 的 `createUnit`，成功后标记
为 `active`。Service middleware 只允许这个流程
创建 Unit，并在读取、提交和应用 changeset 时确认产品节点仍为 `active`，且当前
Session 拥有有效空间或文档角色。`viewer` 的提交会在 Service middleware 中被拒绝，
不能依赖前端只读状态保障安全；协议兼容 Authz API 同时把角色映射为 Univer
`UnitAction`。Sheet 前端还设置本地 `WorkbookEditablePermission`，提供明确的只读
体验。

Sheet、Doc、Slide 重命名通过对应 Unit 类型的协同 mutation 提交；changeset confirmed 后，
`changesetCommitted` 事件把名称同步到产品资源表。因此名称修改会进入协同版本与
History。Board、Base 在 alpha.7 阶段只更新产品资源表，待公开 transformer 和稳定的
协同重命名入口一并可用后再收敛为同一语义。

删除资源或文件夹前，ProductStore 用一次递归查询取得按 `unitID` 排序、且会随根节点
改变状态的连续子树 Unit 批次。应用在改变任一存储前按
`MAX_UNIT_LIFECYCLE_BATCH_SIZE`（当前为 `100`）预检；超限时明确拒绝，不自动拆批。
通过预检后，应用先以私有 request customData 标记调用
`collabService.deleteUnits/recoverUnits`，再改变产品回收站状态。Service middleware
验证该标记、逐个 Unit 权限并拒绝 hard delete。文件夹会连同当前同状态的连续子树一起
软删除或恢复，协同 snapshot、changeset 和 revision 在软删除期间保留，但普通协同
读写不可见。

产品表与协同表属于两个独立事务边界。第二步产品操作失败时，应用 best-effort 执行
第一步协同操作的逆操作；删除批次不会包含操作前已经在回收站中的后代，因此补偿不会
把它们意外恢复。`createApplicationRouter` 拥有一个进程内生命周期协调器，全局串行化
完整的协同与产品双存储操作；取得锁后会重新读取根节点，删除只接受 `active`，恢复只
接受 `deleted` 且上级可恢复，并根据最新空间成员或资源成员关系重新计算根节点删除权限。
因此排队期间权限被撤销的请求会在接触任一存储前失败，重复请求和重叠的父子树也不会
让后到请求反向补偿先到请求。这只是单 Router 进程内的互斥与 best-effort 补偿，不是
durable 分布式事务；
多进程部署仍需应用级持久化协调方案。它也不承担跨模块永久清理。删除会清除相关用户
的最近打开记录，恢复后不会自动重新进入最近列表。

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

`POST /api/worktrees/:worktreeID/units/new` 除模板创建外，也允许 Doc 调用方提交完整初始数据：

```json
{
  "resourceID": "paper-doc",
  "unitID": "paper-doc",
  "spaceID": "personal-space-id",
  "parentID": null,
  "name": "Paper",
  "type": 1,
  "initialData": {
    "id": "paper-doc",
    "rev": 1,
    "title": "Paper",
    "body": { "dataStream": "..." },
    "documentStyle": { "pageSize": { "width": 960, "height": 1122.67 } }
  }
}
```

带 `initialData` 时只支持 Doc（`type = 1`），且 `initialData.id` 必须等于 `unitID`、`rev`
必须为 `1`。完整数据随 create operation journal 持久化，并由 `createUnitFromData` 一次生成
初始 snapshot；服务端不会先创建空 Doc。响应未知时应使用完全相同的
`worktreeID / unitID / resourceID / metadata / initialData` 重试。相同 identity 的不同输入会被拒绝。
新 resource 仍处于 `staged`，只有 Worktree merge 后才激活。

## Spike 边界

当前不包含公开链接、匿名访问、组织/群组同步、团队所有权转移、节点移动、永久删除 UI，
以及 Doc/Slide 的历史 UI。个人空间暂只支持单个文档定向分享，不支持分享整个个人
文件夹。搜索在当前页面已加载的目录或资源中进行。集成测试覆盖个人目录、团队四角色
边界、管理员越权拒绝、个人文档定向分享、五种 Unit、History、递归删除和恢复。
Worktree 集成测试也覆盖 Board、Base 的协议 snapshot 创建、暂存和 merge 激活。
