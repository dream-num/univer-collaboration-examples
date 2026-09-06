# Office App 设计

本文描述 `office-app` 的应用层设计。Collaboration、Comment 和 History 的领域不变量仍以
各 SDK package 的当前设计为准。

相关文档：[需求](./requirements.md) · [领域词汇](../CONTEXT.md)

## 组件边界

```text
Browser
├── React product shell
│   ├── Auth pages
│   ├── Unit list / trash
│   └── Member management
└── Univer editor selected by Unit type
    ├── Collaboration Client
    ├── Comment Client（Sheet/Doc）
    ├── History UI（五类）
    └── Exchange Client（Sheet/Doc/Slide/Base）

Node application
├── Express product API
│   ├── Auth
│   ├── Units and members
│   └── Exchange orchestration
├── Node Transport
│   ├── UniverCommentEndpoint
│   ├── UniverHistoryEndpoint
│   └── UniverCollabEndpoint
├── UnitRepository
├── UniverCollabService → SQLiteDatabaseAdapter
├── UniverCommentService → SQLiteCommentDatabaseAdapter
└── UniverHistoryService → SQLiteHistoryDatabaseAdapter
                         └── .data/office-app.sqlite
```

产品 API 不伪装成 SDK Service。Transport 认证中间件只把受信任 `userID` 和请求级
`customData` 交给 Endpoint；Unit metadata、成员和角色仍由应用 Repository 管理。

## 源码组织

```text
src/
├── client/
│   ├── components/               跨页面的小型 UI 组件
│   ├── locales/                  zh-CN / en-US 产品文案
│   ├── pages/{auth,units,editor} 页面及紧邻页面的 Dialog/Card
│   └── univer/                   五类 Unit 的 Univer 装配
├── server/
│   ├── auth/                     repository → service → routes
│   ├── units/                    content、repository、Unit 与成员 service/routes
│   ├── collaboration/            SDK Service、Endpoint、Transport 和 ACL 装配
│   ├── exchange/                 格式表、转换 service、routes
│   ├── app.ts                    依赖组装和 Express middleware
│   └── main.ts                   HTTP server、upgrade 和关闭信号
└── shared/                       前后端共用的稳定小类型与能力表
```

目录参考常见 React 页面划分和 Express feature folder，但不复制生产项目的完整分层。仅当代码
确实承担独立职责时才拆文件：routes 处理 HTTP，service 编排跨 Repository/SDK 的流程，repository
集中 SQL。示例不增加 DI 容器、ORM、controller class 或 application/domain/infrastructure 层。

## 存储所有权

### 单一 SQLite 文件

Unit Repository 与 Core Collaboration、Comment、History SQLite Adapter 共用
`.data/office-app.sqlite`。这是部署和备份边界，不改变表的逻辑所有权：应用只迁移和查询
`app_*` 表，各 SDK Adapter 继续独占自己管理的 `collaboration_*` 表。

采用同一物理文件便于示例启动、备份和重置，但各 Repository/Adapter 仍持有独立连接和公开
事务边界。应用不能因为文件相同就绕过 Service 或直接组合私有表事务。

产品表如下：

```sql
CREATE TABLE app_users (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  locale TEXT NOT NULL CHECK (locale IN ('zh-CN', 'en-US')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE app_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE TABLE app_units (
  unit_id TEXT PRIMARY KEY,
  type INTEGER NOT NULL,
  name TEXT NOT NULL,
  creator_user_id TEXT NOT NULL REFERENCES app_users(user_id),
  state TEXT NOT NULL CHECK (state IN ('creating', 'active', 'deleting', 'deleted', 'recovering')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  deleted_at_ms INTEGER
);

CREATE TABLE app_unit_members (
  unit_id TEXT NOT NULL REFERENCES app_units(unit_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (unit_id, user_id)
);
```

`creator_user_id` 是唯一 Creator。`app_unit_members` 不保存 `creator`，从结构上禁止第二个
Creator 或所有权转让。查询角色时先匹配 Creator，再读取成员表。

建议索引：

- `app_units(creator_user_id, state, updated_at_ms DESC)`；
- `app_unit_members(user_id, unit_id)`；
- `app_sessions(user_id)` 和 `app_sessions(expires_at_ms)`。

Exchange 不增加持久化表：25 MiB 以内的上传只在单次请求内存中转换，导出结果直接写入当前
HTTP response。示例因此没有后台 task、poll、sign-url 或临时文件清理流程；如需大文件或异步
转换，应另行增加对象存储与可靠 task，而不是把二进制写进本 SQLite 文件。

Core Collaboration、Comment 和 History Adapter 在同一文件中使用各自已定义的
`collaboration_*` 表及 schema component。应用不查询、join、迁移或写入这些表。

## 身份与 Session

注册时生成 UUID `userID`。密码编码包含 scrypt 参数、salt 和 hash；校验使用恒定时间比较。
登录生成高熵随机 token，Cookie 保存明文 token，数据库只保存 SHA-256 token hash。

Transport middleware 从 HTTP/WebSocket upgrade Cookie 解析 Session，并设置：

```text
context.userID = app_users.user_id
context.customData.currentUser = 当前请求的只读用户摘要
```

未认证请求在进入任何 Collaboration、Comment、History 或 Exchange Endpoint 前返回 401。

### Presence

Endpoint `connect` 从受信任 Session 的用户摘要设置 `member.name = displayName`，
并保留 `member.avatar = ""`。前端 `UserManagerService` 使用相同的 `userID`、姓名和空头像。

五类编辑器共用顶部在线成员列表，通过公开 `MemberService` 订阅当前房间，按 `userID`
合并同一用户的多个连接，并显示连接数；光标仍按 `memberID` 区分。空头像显示姓名首字符。
在线成员与拥有访问权限的成员分别展示，连接状态来自当前 `CollaborationSession`。
断线时隐藏在线名单并提供重连入口，离开编辑器时释放订阅。

Sheet、Doc、Slide、Board 的远端光标／选区由 SDK 渲染。
当前 Base SDK 没有远端光标／选区能力，只展示在线成员。

## 统一角色解析

应用只实现一个 `resolveRole(userID, unitID)`：

```text
app_units.creator_user_id = userID → creator
app_unit_members.role              → editor | viewer
无记录                              → none
```

角色查询同时验证 `app_units.state = active`。同一次 Service 调用可以把解析结果缓存到
`context.customData`，但不能跨请求复用，也不能把角色写入客户端可信 payload。

统一 capability 映射：

```text
view             creator | editor | viewer
edit             creator | editor
comment          creator | editor
viewHistory      creator | editor | viewer
recoverHistory   creator | editor
export           creator | editor | viewer
manageMembers    creator
delete/recover   creator
```

## 权限接入点

权限必须在所有入口一致执行：

- Product API：列表、rename、成员管理、删除、恢复、导入和导出。
- Transport：认证并提供可信 `userID`。
- Endpoint `joinUnit`：要求 `view`。
- Service `readUnitData`：要求 `view`。
- Service `submitChangeset` 与 `applyChangeset`：要求 `edit`；重试阶段只执行可重试的 ACL 读取。
- Service `deleteUnits` / `recoverUnits`：要求 Creator。
- Comment `listComments`：要求 `view`。
- Comment 五个写 action：要求 `comment`；edit 继续由 Comment Service 检查作者。
- Comment delete：作者本人或 Creator。
- History 三个读取 action：要求 `viewHistory`。
- Authz batch endpoint：按 `UnitAction` 映射 `View`、`Edit`、`Comment`、`Export`、
  `ViewHistory` 和 `RecoverHistory`。

Viewer 的 changeset、Comment write 和 restore 即使绕过 UI 直接请求，也必须得到
`PERMISSION_DENIED`。

## 成员变更和在线 Session

角色从 Editor 改为 Viewer 后，Service middleware 会立即阻止后续写入；客户端也必须刷新
权限点以进入只读状态。移除成员还必须阻止该用户继续接收实时广播。

Endpoint 提供 `invalidateUnitSessions({ unitID, userID })`。成员管理遵守以下顺序：

1. 成员事务提交；
2. 失效目标用户当前在线 Session 并关闭连接；
3. 新 JOIN 重新执行 `joinUnit` ACL；
4. 被移除用户的 HTTP、Comment、History 和 submit 同时被应用 ACL 拒绝。

示例只调用 Endpoint 的公开失效 API，不访问内部 Session registry，也不通过重建 Endpoint
模拟定向失效。

## Unit 生命周期

产品 Repository 和 Collaboration Adapter 即使共用 SQLite 文件，也没有可组合的公开跨连接
事务，使用显式状态恢复。

### 创建

```text
INSERT app_units(state=creating, creator=current user)
→ service.createUnitFromData / createUnitFromSnapshot
→ UPDATE app_units(state=active)
```

启动恢复：`creating` 对应的 Unit 已存在则完成为 `active`；不存在则删除未完成产品记录。

### 删除

```text
active → deleting
→ service.deleteUnits(hardDelete=false)
→ deleted + deleted_at_ms
```

`unitsDeleted` 会关闭 Collaboration room barrier。Comments 和 History 表不删除，但它们的
middleware 因 Unit 非 active 而拒绝读取。启动时重试残留 `deleting`。

### 恢复

```text
deleted → recovering
→ service.recoverUnits
→ active + deleted_at_ms=NULL
```

恢复保留原 Unit revision、Comment、History 和成员。当前不提供 hard delete，原因见
[ADR 0002](./adr/0002-soft-delete-only-until-cross-domain-purge-exists.md)。

### 修改时间

`app_units.updated_at_ms` 在 `changesetCommitted` listener 中 best-effort 更新。该字段只用于列表
排序，不参与 revision、ACK 或数据库正确性；listener 失败不能回滚 confirmed changeset。

## Comments

Comment body、reply 和 solved 状态由 `UniverCommentService` 管理；root anchor 仍通过普通
Collaboration changeset/resource 保存。User Provider 从 `app_users` 批量返回显示名称和稳定
`userID`。

当前编辑器装配：

- Sheet：Creator/Editor 使用 Sheet Thread Comment UI 和 datasource；
- Doc：Creator/Editor 使用 Doc Thread Comment UI 和 datasource；
- Sheet/Doc Viewer：使用应用层只读抽屉直接读取 Comment Endpoint。公共 UI 的 Comment
  permission point 同时控制读取面板和新增入口，无法准确表达 Viewer 的只读语义；
- Slide、Board、Base：不注册 Comment UI，不显示入口。

不能只注册后三类前端 UI。当前服务端 Runtime 未承诺其 anchor apply、snapshot 和 replay，
详见 SDK [Thread Comment roadmap](../../../../univer-collaboration-sdk/docs/roadmap/thread-comment.md)。

## History

五类编辑器共用应用层 History 抽屉。抽屉读取 `UniverHistoryEndpoint`，展示贡献者、时间和
revision 范围；Creator/Editor 通过当前协同 Session 执行公开 `RevertRevisionMutation`，Viewer
只显示记录。History User Provider 从 `app_users` 解析贡献者。

安装基线 `1.0.0-beta.2` 的通用 `edit-history-loader` 只支持 Sheet，五类专用 History UI 包又未
发布到当前公共 registry，因此示例不能把通用插件误注册到其他 Unit。TODO：专用包公开发布后，
单独把应用层抽屉替换为各 Unit 原生预览 UI；History Service、权限和数据模型无需变化。

示例采用：

```ts
historyService.attach(collabService);
```

这是最终一致、进程内 best-effort 的便利模式。SQLite 会持久化已成功索引的数据，但进程在
commit 与排队/写入之间崩溃时可能漏索引。README 必须把 transactional outbox 说明为生产
替代方案，示例不实现假的可靠队列。

History HTTP 读取要求 `viewHistory`。恢复最终仍提交普通 restore changeset，并由 Authz 与
Service `submitChangeset` 再次要求 `recoverHistory/edit`，不能只依赖按钮可见性。

## Office 导入导出

Exchange 使用本地 `@univerjs-pro/exchange-node`：

```text
authenticated multipart upload
→ validate Unit type and extension
→ convert buffer to exact snapshot
→ create app_units(creating) and Collaboration Unit
→ app_units(active) and return the new Unit

authenticated export
→ materialize current confirmed snapshot
→ convert to an Office buffer
→ write the attachment response
```

导出先通过 `getUnitLoadDataWithBlocks` 和 `UnitSnapshotMaterializer` 获取当前 confirmed revision。
导入先创建产品 `creating` 记录，再以新 UUID 调用 `createUnitFromSnapshot`，成功后转为 active。

上传限制为 25 MiB，文件名只用于格式推断和新 Unit 名称。Board 不显示导入导出入口，服务端也
拒绝其格式组合。异步任务与对象存储属于生产扩展，不在本示例伪造。

## 前端路由与交互

```text
/login
/register
/
├── active units
├── created by me
├── shared with me
└── trash
/editor?unit=<unitID>&type=<UniverType>
```

Unit 页面包含新建下拉、导入、类型筛选、角色徽标、创建者、更新时间和行操作。Creator 在成员
弹窗中按用户名搜索、添加、改角色和移除。Trash 只向 Creator 展示其已删除 Unit 和恢复操作。

Editor 页面顶部显示返回、Unit 名称、角色、连接状态、History、导出、语言和当前用户。Viewer
使用同一路由，但 Authz permission points 让编辑器进入只读模式。

## Unit 编辑器装配

前端按 URL 中经过服务端 metadata 校验的 Unit type 选择能力，只初始化一个 Unit。共享装配
包括 License、Collaboration Client、Authz 和应用层 History 抽屉；类型能力注册自己的
core/UI 和可用的 Comment/Exchange 插件。

URL 的 `type` 不是权威值。加载前产品 API 返回 Unit metadata，前端发现 URL type 不一致时
使用服务器 type；所有 SDK HTTP 请求仍由服务端验证 Unit ID、type 和角色。

## Localization

产品文案使用 `zh-CN`、`en-US` 字典和稳定 key。初始 locale 取用户资料；注册默认值来自
浏览器。日期通过 `Intl.DateTimeFormat` 呈现。

Univer locale 在创建实例时确定。用户切换语言后：

1. 更新用户资料；
2. 更新产品 shell；
3. dispose 当前 Univer 实例；
4. 以新 locale pack 重新初始化并加载同一 Unit。

切换过程不创建 Unit、不提交内容 mutation，也不改变 Unit 内容。

## 应用 API

```text
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
PATCH  /api/auth/locale

GET    /api/units?scope=all|created|shared|trash
POST   /api/units
GET    /api/units/:unitID
PATCH  /api/units/:unitID
DELETE /api/units/:unitID
POST   /api/units/:unitID/recover

GET    /api/units/:unitID/members
PUT    /api/units/:unitID/members/:username
DELETE /api/units/:unitID/members/:username

POST   /api/import
GET    /api/units/:unitID/export?format=xlsx

POST   /universer-api/authz/-/object/-/batch_allowed
*      /universer-api/*  → Collaboration / Comment / History Transport
```

应用 API 返回稳定错误 code，前端按 locale 映射显示文本；不要依赖服务端英文 message 完成
本地化。

## 验证

- Repository：用户名唯一、Session 过期、Creator/Member 互斥、角色查询和状态迁移。
- ACL：逐角色覆盖 Product API、Authz、JOIN、read、submit、Comments、History 和 Exchange。
- Session invalidation：移除在线成员后不再接收 changeset、Comment 或 Presence。
- 五类 Unit：create、edit、snapshot、restart/reload、History view/restore。
- Comments：Sheet/Doc anchor apply、snapshot、reload/replay、正文持久化和角色策略。
- Exchange：每个受支持输入输出格式、XLSX 目标类型选择、越权下载和过期清理。
- Localization：两种 locale 的缺失 key 检查以及编辑器重建不产生内容 mutation。
- 端到端：Creator、Editor、Viewer 三个浏览器完成协同、权限拒绝、删除和恢复。
