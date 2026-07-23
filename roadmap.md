# Univer Collaboration Examples Roadmap

## 1. 目标

`univer-collaboration` 完成框架设计和实现后，提供三个相互独立、可直接运行的全栈示例：

1. `basic-sheets`：证明现有 Univer 协同前端可以用极少改动切换到新后端。
2. `basic-auth-demo`：展示业务用户、Bearer JWT、WebSocket session ticket 和文档 ACL 的接入方式。
3. `univer-suite-demo`：展示如何基于新后端构建支持全部现有文档类型的在线办公套件。

三个示例由浅入深，但不存在代码依赖关系。读者进入任意目录，都可以独立理解、启动和修改该示例。

本文记录已经确认的需求与实施顺序。阶段 0 和 `basic-sheets` 已完成；
`univer-suite-demo` 已有 Sheet、Doc、Slide 文件空间 spike，其余产品化能力仍是
需求，不描述为已实现能力。

## 2. 共同原则

### 2.1 目录

```text
examples/
├── README.md
├── roadmap.md
├── basic-sheets/
├── basic-auth-demo/
└── univer-suite-demo/
```

当前 `jwt-memory-auth` 设计草案后续并入 `basic-auth-demo`，不同时保留两个定位重叠的认证示例。

### 2.2 独立性

- 每个示例拥有自己的前端、后端、SQLite schema、seed、测试、启动命令和 README。
- 三个示例不共享业务代码；可以复用仓库级 TypeScript、lint 和构建配置。
- 每个示例都应支持一条命令启动，并提供独立的数据库初始化和重置命令。
- 示例数据存放在各自的 `.data/` 目录，不提交运行时数据库文件。

### 2.3 数据与正确性

- 三个示例全部使用 SQLite Database Adapter，不使用内存数据库。
- 页面刷新和服务重启后，文档、changeset、revision、权限和业务元数据仍然存在。
- `userId` 是稳定业务主键，也是 confirmed changeset 的作者；`username` 只用于登录和展示。
- `memberId` 由 UniverCollabEndpoint 为 Session 生成，不能由前端作为可信身份提供。
- 前端不能提供可信 revision、confirmed author 或服务端 customData。
- 所有权限必须由服务端 middleware 强制执行；前端只读状态只是用户体验的一部分。

### 2.4 页面与文档质量

- 页面中出现的按钮、菜单和入口必须真实可用，不放置占位功能。
- 尚未实现的功能不提前出现在界面中。
- 每个页面都提供真实的 loading、空状态、权限错误、资源不存在、网络中断和重试行为。
- README 同时说明快速启动、演示账号、核心流程、生产环境差异和安全限制。
- 示例代码以清晰、可复制为第一目标；允许适量重复，不为减少代码行数抽取跨示例业务层。

## 3. `basic-sheets`

### 3.1 定位

用最少的新代码证明 `univer-collaboration` 对现有 Univer 协同客户端的协议兼容性。

前端以 `univer-pro/examples/src/sheets` 为基线，尽可能保持相同的：

- 插件注册结构。
- URL 参数。
- Unit 创建与加载流程。
- 协同客户端配置方式。
- Sheet 编辑体验。

不为新后端增加前端协议转换层或专用客户端封装。README 必须列出相对上游 `sheets` example 的全部差异。

如果上游 example 中某个入口依赖 collaboration server 范围之外且本示例没有实现的服务，应整体移除对应入口，并在差异清单中解释原因；不能保留不可用菜单。

### 3.2 页面与流程

- 页面主体是全屏 Univer Sheet 编辑器，不增加文件列表、登录页或业务导航。
- URL 没有 `unit` 时，后端创建空 Sheet，然后跳转到 `?unit=<unitID>&type=2`。
- URL 带 `unit` 时，由上游 Collaboration Data Loader 自动加载对应 Sheet，不手动调用 facade load API。
- 后端为所有请求硬编码同一个 `demo-user`，不在本示例实现认证、Cookie 或用户持久化。
- 复制当前 URL 到另一个浏览器，即可演示实时编辑、在线成员和 presence。
- 不增加本仓库自定义的 loading shell、Injector 操作或协同状态 workaround。

固定身份只用于消除最小示例中的登录步骤，README 必须明确说明不能将它作为生产鉴权方案。

### 3.3 后端

- 使用新的 UniverCollabService、Node Transport、UniverCollabEndpoint 和 SQLite Database Adapter。
- 同源提供前端、HTTP 协同端点和 WebSocket 端点，避免 CORS 干扰最小示例。
- SQLite 持久化 snapshot、changeset、revision、提交幂等信息和 history 展示索引。
- 支持断线重连和缺失 changeset 补齐。
- 提供数据库重置命令。
- 为与上游 Sheet example 保持兼容，复用现有 edit history UI，并提供其所需的兼容历史接口。

### 3.4 不包含

- 注册和账号管理。
- 业务 ACL。
- 文件列表和资源树。
- 分享管理。
- 多文档类型入口。
- 管理后台。

### 3.5 验收场景

1. 启动 demo 并打开不带 `unit` 的地址，自动创建 Sheet 并跳转到稳定 URL。
2. 将 URL 复制到另一个浏览器，两个不同 member 可以实时编辑并看到在线状态。
3. 刷新页面或重启服务后，Sheet 内容保持不变。
4. 模拟网络中断后重新连接，客户端补齐缺失 changeset 并恢复一致。
5. 打开历史版本列表，能够查看并恢复已有版本。

alpha.6 在线 peer restore conflict 属于上游 known issue，不在 example 中使用私有
Client API 擅自修复，记录见 `docs/issues/known-issues`。

## 4. `basic-auth-demo`

### 4.1 定位

集中展示应用如何把已有用户系统和文档 ACL 接到 Collaboration Transport 与 lifecycle middleware。

该示例只支持 Sheet，不包含普通用户分享流程、工作空间或多文档类型。

### 4.2 页面

#### `/login`

- 使用预置用户名和密码登录。
- 登录成功后返回 Bearer JWT，不使用认证 Cookie。
- 前端保存 JWT，并为业务 API 和协同 HTTP 请求统一注入 `Authorization: Bearer <JWT>`。
- 页面展示可直接使用的 demo 账号。

#### `/documents`

- 只展示当前用户有权读取的 Sheet。
- 每个 Sheet 显示当前用户的 `admin`、`editor` 或 `viewer` 角色。
- 支持进入文档和退出登录。

#### `/documents/:unitID`

- 打开协同 Sheet。
- 顶部只增加当前用户、当前角色、连接状态和退出入口。
- `viewer` 使用前端只读体验，服务端同时拒绝其 submit。
- 用户角色在编辑期间被撤销或降级后，后续请求立即按新角色处理，并显示明确错误。

#### `/demo-admin`

- 无需登录即可访问。
- 直接设置 `用户 × 文档 → admin/editor/viewer/none`。
- 修改立即写入 SQLite，并影响后续 read 和 submit 请求。
- 页面顶部固定展示警告：该管理页面和接口故意不鉴权，只能用于 demo，不能复制到生产环境。
- 普通用户页面不提供分享或成员管理入口。

### 4.3 认证链路

1. 用户名和密码换取 JWT。
2. JWT 的 `sub` 保存稳定 `userId`，并包含明确过期时间。
3. 普通业务 API、snapshot、changeset submit 和 session-ticket 请求都使用 Bearer JWT。
4. 浏览器先通过带 JWT 的 HTTP 请求获取短期、一次性 WebSocket session ticket。
5. WebSocket URL 只携带 session ticket，不暴露长期 JWT。
6. Transport 验证 JWT 后向 Endpoint 提供可信 `userId/customData`；Endpoint 签发并消费 ticket，再把 Session 传给 Service。
7. HTTP submit 必须验证当前 JWT 用户与 `memberID` 对应 Session 的用户一致。

首版不实现 refresh token；JWT 过期后返回登录页。README 说明 token 存储策略和生产环境中的 XSS 风险。

### 4.4 权限链路

- `read` middleware 允许 `admin/editor/viewer`，拒绝 `none`。
- `submit` middleware 在加载 Unit 和 OT 前拒绝 `viewer/none`。
- `apply` middleware 再次读取当前角色，避免编辑过程中权限被撤销后仍提交成功。
- `admin/editor` 可以编辑，`viewer` 只读。
- 权限缓存只能放在当前 `request.customData`，不能放在共享的 `session.customData`。
- 后端分别返回未认证、token 过期、无读取权限和无编辑权限错误；前端显示对应状态。

### 4.5 SQLite 数据

- 用户和密码哈希。
- Sheet 业务元数据。
- 用户—文档—角色映射。
- snapshot、changeset、revision 和提交幂等信息。
- WebSocket ticket 的短期状态；ticket 必须一次性消费并及时过期。

提供 Alice、Bob 等预置账号和若干预置 Sheet，便于切换用户验证不同权限。

### 4.6 不包含

- 用户注册和找回密码。
- Refresh token。
- 面向普通用户的分享流程。
- 工作空间和文件树。
- 多文档类型。

### 4.7 验收场景

1. Alice 登录后只看到自己有权限的 Sheet。
2. editor 可以实时编辑，viewer 只能读取。
3. 在 `/demo-admin` 修改角色后，新权限立即生效。
4. viewer 伪造前端请求提交 changeset 时仍被服务端拒绝。
5. JWT 过期后，HTTP 和 WebSocket 重连都不能绕过认证。
6. session ticket 不能重复使用，也不能替代 JWT 调用普通 HTTP API。

## 5. `univer-suite-demo`

### 5.1 定位

提供一个真实可运行的多类型协作办公套件参考应用，产品形态接近 Google Drive、Google Docs 和飞书文档，但只展示已经完整实现的能力。

支持以下全部现有可编辑 Unit 类型：

- Sheet。
- Doc。
- Slide。
- Base。
- Board。

`UNIVER_PROJECT` 不作为“新建文档”类型；项目与层级由应用自己的空间和资源树表达。

### 5.2 空间与资源模型

```text
用户
├── 个人空间
│   └── 文件夹 / Unit / 快捷方式组成的资源树
└── 共享工作空间（可加入多个）
    └── 文件夹 / Unit 组成的资源树
```

- 每个用户有一个个人空间。
- 用户可以创建或加入多个共享工作空间。
- 文件夹支持任意层级。
- Unit 节点关联一个 Sheet、Doc、Slide、Base 或 Board。
- 快捷方式只存在于个人空间，引用一个已分享给当前用户的个人文档。
- 快捷方式不复制 Unit、不改变所有者，也不产生访问权限。

### 5.3 权限模型

#### 个人空间

- 个人资源默认私有。
- 文档所有者可以按用户授予 `editor/viewer`。
- 被分享的文档出现在接收者的“与我共享”。
- 个人文档可以开启“任何人持链接可查看”，但不支持匿名编辑。
- 已登录但无权限的用户打开链接时，看到申请访问页。

#### 共享工作空间

- 只使用 `空间 → 用户 → admin/editor/viewer` 权限。
- `admin` 管理空间成员和全部内容。
- `editor` 创建、修改、移动和删除空间内容。
- `viewer` 只读空间内全部内容。
- 空间内部不提供文件夹或文档级 ACL，也不做子节点权限继承计算。
- 非空间成员打开空间文档链接时，只显示无权访问，并提示联系分享者加入该空间。

#### 移动

- 同一空间树内移动不改变权限。
- 跨个人空间和共享工作空间移动会改变资源归属和权限。
- 跨空间移动前必须展示权限变化，确认后在一个事务中完成树节点、归属和授权迁移。

### 5.4 主要页面

#### 登录与注册

- 支持注册、登录、退出和会话恢复。
- 使用 Bearer JWT 和一次性 WebSocket session ticket。

#### 文件空间首页

- 左侧导航包含最近使用、个人空间、与我共享、回收站和共享工作空间列表。
- 中间区域显示当前目录的面包屑和资源列表。
- 支持按名称搜索当前用户有权访问的文件与文件夹。
- “新建”入口只展示已经支持的文件夹和五种 Unit 类型。
- 资源操作包括打开、重命名、移动、软删除、恢复和永久删除。

#### 编辑器页

- 顶部产品栏提供返回文件空间、文档图标、可编辑标题、面包屑、保存状态、连接状态和在线成员。
- 个人文档展示分享入口；共享工作空间文档展示空间成员入口。
- 产品栏以下完整交给对应的 Univer 编辑器，不重复实现编辑器内部工具栏。
- Sheet、Doc、Slide、Base 和 Board 根据 Unit 类型加载各自的插件或 preset。

#### 分享链接

- 已有权限时直接打开原文档，并记录到“最近使用”和“与我共享”。
- 文档不会自动进入接收者的资源树。
- 接收者可以主动把快捷方式添加到个人空间的任意目录。
- 已登录但无权限时显示申请访问页。
- “任何人持链接可查看”允许匿名只读，不允许匿名编辑。

#### 回收站

- 软删除后的资源离开原树并进入所属空间的回收站。
- 支持恢复到原位置；原父目录不存在时恢复到空间根目录。
- 永久删除必须二次确认，并清理业务元数据和对应协同数据。

### 5.5 协作能力

- 多人实时编辑。
- 在线成员和 presence。
- `viewer` 前端只读与服务端强制权限。
- 连接状态和保存状态。
- 网络中断后的自动重连。
- 根据 revision 获取并应用缺失 changeset。
- 页面刷新和服务重启后的持久化恢复。
- 所有五种 Unit 类型使用同一套 Session、Request、middleware、revision 和 Database Adapter 契约。

### 5.6 版本历史

- 复用 Univer 现有 edit history UI，不重新实现历史面板。
- 服务端使用已持久化的 revision、changeset 和 snapshot 提供历史数据。
- 支持查看历史版本和恢复。
- 恢复历史版本时创建一个新的最新 revision，不删除、不重排也不覆盖旧 revision。
- 历史查看和恢复同样执行当前用户权限检查。

### 5.7 首版不包含

- 线程评论。
- 模板中心。
- 通知中心。
- 文档正文全文搜索。
- 组织架构同步。
- 审计后台。
- 计费和配额。

### 5.8 验收场景

1. 用户注册登录后，在个人空间创建五种 Unit，并在资源树中移动和重命名。
2. 用户把个人文档分享给另一个用户；对方从“与我共享”打开，并添加快捷方式。
3. 用户创建共享工作空间，设置 admin/editor/viewer；所有空间内容使用同一个空间角色。
4. 非空间成员通过空间文档链接访问时被拒绝，不能获得单文档授权。
5. 两名 editor 实时编辑同一 Unit，看到在线状态，并在重连后恢复一致。
6. viewer 无法通过修改前端状态绕过服务端提交权限。
7. 删除资源后可以从回收站恢复或永久删除。
8. 查看历史版本并恢复后，产生新的 revision，其他在线客户端最终收敛到恢复后的最新状态。

## 6. 页面设计原则

### 6.1 `basic-sheets`

- 整个页面就是 Univer Sheets example。
- 不添加产品导航或文件管理壳。
- 只为不可恢复错误和连接状态增加必要反馈。

### 6.2 `basic-auth-demo`

- 页面刻意简单，突出登录、文档角色和 Bearer JWT 链路。
- `/login`、`/documents`、`/documents/:unitID` 和 `/demo-admin` 各自只有一个清晰目的。
- 不为了视觉完整度加入分享、通知、搜索或工作空间入口。

### 6.3 `univer-suite-demo`

- 文件空间使用稳定左侧导航、顶部搜索与账号入口、中间资源列表。
- 编辑器使用轻量产品头部，跨文档能力放在头部，具体编辑能力交给 Univer。
- 个人文档显示“分享”，共享空间文档显示“空间成员”，避免出现无法实现的子级权限入口。
- 桌面端优先；响应式布局必须保证登录、文件浏览和只读查看可用，不要求首版在窄屏提供完整编辑体验。

## 7. 实施顺序

以下顺序不承诺日期；每个阶段只有在对应验收条件通过后才进入下一阶段。

### 阶段 0：框架前置能力

状态：已完成（Phase 1 Step 1–12）。

- UniverCollabService、Node Transport 和 UniverCollabEndpoint 均提供可运行实现。
- SQLite Database Adapter 通过共享 database testkit。
- 完成 snapshot、changeset、submit、WebSocket、session ticket、authz 和 history 所需的协议端点。
- Headless Unit Runtime 能加载和应用 Sheet、Doc、Slide、Base、Board 的 snapshot 与 changeset。
- 版本历史查询和恢复语义稳定。

### 阶段 1：示例基础设施

状态：`basic-sheets` 所需部分已完成；跨三个示例的公共浏览器测试基础设施随后续示例再抽象。

- 将 `examples/*` 加入 pnpm workspace。
- 统一开发脚本、端口约定、SQLite 数据目录和重置方式。
- 建立 examples 总 README 和能力矩阵。
- 建立浏览器端到端测试基础设施。

### 阶段 2：`basic-sheets`

状态：已完成（Phase 1 Step 13）。实现、启动和生产差异见 [`basic-sheets/README.md`](./basic-sheets/README.md)。

- 对齐 `univer-pro/examples/src/sheets` 前端。
- 使用固定演示用户和 SQLite，不在最小示例中实现用户系统。
- 跑通创建、加载、实时编辑、重连、持久化和历史恢复。
- 完成与上游 example 的差异清单。

### 阶段 3：`basic-auth-demo`

- 实现 SQLite 用户、密码哈希、JWT、session ticket 和文档角色。
- 实现四个页面及 demo-only 权限配置接口。
- 覆盖权限撤销、viewer 绕过尝试、token 过期和 ticket 重放测试。
- 用可运行示例替换当前 `jwt-memory-auth` 草案。

### 阶段 4：`univer-suite-demo` 文件空间

状态：Spike 已完成账号、个人空间中的资源列表、创建、软删除和恢复；共享空间、
文件夹树与分享仍未实现。

- 实现账号、个人空间、共享工作空间和资源树 schema。
- 实现资源 CRUD、名称搜索、最近使用、与我共享和回收站。
- 实现个人文档分享、空间成员权限和快捷方式。
- 完成文件空间、错误页和访问申请页。

### 阶段 5：`univer-suite-demo` 多类型编辑器

状态：Spike 已接入 Sheet、Doc、Slide。Board / Base 创建受 alpha.6 transformer
export 限制，非 Sheet 历史 UI 受 alpha.6 viewer 限制，见 `docs/issues`。

- 分别接入 Sheet、Doc、Slide、Base 和 Board。
- 实现统一编辑器产品头部、连接状态、在线成员和权限只读体验。
- 跑通五种 Unit 的实时编辑、重连、持久化和历史恢复。
- 验证跨空间移动的归属与权限事务。

### 阶段 6：质量与发布

- 运行单元、集成、协议兼容和端到端测试。
- 验证 SQLite 并发、revision CAS 和提交幂等。
- 验证所有界面入口可用，不存在占位按钮。
- 完成 README、架构说明、安全边界和生产部署差异说明。
- 提供可重复的 seed 与演示脚本。

## 8. 完成标准

一个示例只有同时满足以下条件才可标记为完成：

- 从全新 checkout 按 README 可以成功启动。
- SQLite 初始化、迁移、seed 和 reset 可重复执行。
- 所有宣称的用户流程都有自动化测试或明确的手动验收脚本。
- 服务重启、客户端刷新和短暂断网不会破坏已确认数据。
- 未认证、无权限和只读用户不能通过直接调用 API 绕过服务端检查。
- 页面上没有无效入口或静态假数据冒充的功能。
- 示例没有把 declaration-only API 描述成可运行能力。
- `pnpm check` 和 `pnpm build` 通过。
