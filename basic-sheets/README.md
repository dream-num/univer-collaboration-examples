# Basic Sheets

最小的持久化 Univer Sheet 协同示例。前端尽量沿用
`univer-pro/examples/src/sheets` 的目录、URL 自动加载和协同插件配置；后端采用：

```text
Express
├── 用户 / Authz / Unit 创建
└── Node Transport
    ├── UniverHistoryEndpoint
    │   → UniverHistoryService
    │     → SQLiteHistoryDatabaseAdapter
    └── UniverCollabEndpoint
        → UniverCollabService
          → SQLiteDatabaseAdapter

HTTP Server WebSocket upgrade
  → Node Transport
    → UniverCollabEndpoint
```

Express 承载同源静态资源和应用层接口。History、snapshot 读取、changeset
submit、session ticket 等协议 HTTP，以及 Comb WebSocket，进入对应
Transport Endpoint。框架本身仍不依赖 Express。

后端按 Express composition root 组织：

```text
server/
├── main.ts             进程启动、端口和信号处理
├── application.ts      显式组装资源、Router 和应用生命周期
├── collaboration.ts    Service、Endpoint、Transport 和 WebSocket
├── routes/
│   ├── user.ts
│   ├── authz.ts
│   └── unit.ts
└── http/
    └── errors.ts       Express 404 和统一错误响应
```

`application.ts` 直接展示各 Router 的挂载关系，并内联 `listen()`、`close()` 和
资源释放顺序；本示例不额外抽象 application handle。

## 启动

要求 Node.js 24 和 pnpm 10。在仓库根目录执行：

```bash
pnpm install
pnpm --filter @univerjs/collaboration-example-basic-sheets build
pnpm --filter @univerjs/collaboration-example-basic-sheets start
```

打开 <http://127.0.0.1:3010>。没有 `unit` 参数时，前端调用上游相同的
create 路由，然后跳转到 `?unit=<unitID>&type=2`。带参数时，由
`CollaborationDataLoaderController` 自动加载，不手动调用 `loadSheetAsync()`。

需要显式 Univer Pro license 时，在构建前设置：

```bash
VITE_UNIVER_LICENSE='your-license' pnpm --filter @univerjs/collaboration-example-basic-sheets build
```

## 演示

1. 打开页面，等待 Sheet 加载。
2. 把完整 URL 复制到另一个浏览器或无痕会话。
3. 在任一端编辑，另一端会收到 confirmed changeset、成员和 presence。
4. 刷新页面或重启服务器，URL、内容、revision 和历史记录保持不变。
5. 从版本历史入口查看历史并恢复旧版本；恢复会创建新的最新 revision。

运行时数据位于 `examples/basic-sheets/.data/`：

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets seed
pnpm --filter @univerjs/collaboration-example-basic-sheets reset
```

执行 reset 前先停止服务器。

## 固定身份

这个 example 不演示认证或用户系统。Express 应用接口直接使用固定用户；
Transport 为每个协同 HTTP 请求设置：

```ts
context.userId = "demo-user";
```

`/universer-api/user`、authz 和 Unit 创建由 Express Router 实现；History 由可选的
`UniverHistoryEndpoint → UniverHistoryService → SQLiteHistoryDatabaseAdapter`
默认实现
提供。其中用户接口返回固定的 `Demo User`，authz 查询固定返回 allowed。
所有浏览器窗口因此拥有相同 `userId`，但 WebSocket `memberId` 不同，仍可测试房间、
Presence、ACK 和广播。

该硬编码方式只能用于本地演示。真实用户、认证与 ACL 集成见
[Basic Sheets Auth](../basic-sheets-auth/README.md)。

## 相对上游 Sheets example 的差异

前端与服务端目录对称，客户端采用：

```text
client/
├── global.css
└── sheets/
    ├── consts.ts
    ├── main.ts
    └── plugins.ts
```

与上游保持一致的部分：

- `?unit=<unitID>&type=2` 驱动 Unit 自动加载。
- Collaboration Client、Collaboration UI 和 Edit History Loader。
- snapshot、Comb、session ticket、authz 和 history URL。
- 创建 Unit 后刷新到稳定 URL。
- 不增加协议转换层或本仓库专用前端 SDK。

有意保留的差异：

- 使用 `UniverSheetsCorePreset`，不注册 comments、live share、chart、pivot、
  import/export、upload、telemetry、debugger 和 action recorder；本后端不提供这些服务。
- 用户和授权由后端硬编码，不使用 OIDC。
- 使用环境变量提供 license。
- 后端替换为本仓库的 Transport → Endpoint → Service 与 SQLite Adapter。

除上游 `fetchServerUser` 同样使用 Injector 设置当前用户外，前端不访问
`ILocalCacheService` 或 `CollaborationController` 来改变协同状态，也不包含
restore workaround。

完整的客户端差异、影响和后续逐项处理清单见
[客户端差异清单](./client-differences.md)。

服务端接口的归类规则和当前 demo 自定义接口见
[服务端接口说明](./server-interfaces.md)；Protocol 全接口目录见
[Univer Protocol 接口索引](../../docs/internal/reference/upstream-protocol/README.md)。

## 已知问题

`@univerjs-pro/collaboration-client@1.0.0-alpha.7` 的在线 peer 收到 restore
changeset 后可能进入 conflict。它存在于未修改的上游客户端，本 example 不擅自修复。
详见 [Collaboration Client peer restore conflict](../../docs/issues/known-issues/collaboration-client-peer-restore-conflict.md)。

服务端仍保证 restore snapshot 在发布 `changesetCommitted` 前持久化，因此
Endpoint 入队和发送 ACK/broadcast 时 snapshot 已经可读；这不等价于修复客户端
conflict。精确时序见
[Snapshots 设计](../../docs/internal/design/modules/snapshots.md)。

## 测试

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets test
```

测试使用临时 SQLite 文件与真实本机 HTTP/WebSocket，覆盖：

- 固定用户和固定授权响应。
- Unit、snapshot 和 history 重启持久化。
- 两个 member 并发提交、ACK、广播和 OT 收敛。
- Presence、断线、重连与 fetch-missing。
- restore 形成新 revision 和 required snapshot。

History metadata 是供 Edit History UI 展示的独立索引。默认按约 60 秒和特殊
mutation 分段，而不是每个 changeset 生成一个历史项。极端进程故障可能造成展示
metadata 缺项，但 confirmed changeset 和 Unit 数据不受影响；生产环境可使用
transactional outbox 或可重建索引。
