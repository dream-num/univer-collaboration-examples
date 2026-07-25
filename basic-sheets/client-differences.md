# Basic Sheets 客户端对齐说明

本文对比：

- 当前 example：`examples/basic-sheets`
- 上游基线：`univer-pro/examples/src/sheets`
- 上游 commit：`bdac4f4aa`
- SDK npm 基线：`1.0.0-alpha.7`

当前 example 不实现另一套前端协同引擎，直接使用官方
`collaboration`、`collaboration-client` 和 `collaboration-client-ui`。

## 已对齐

### 协同主链路

| 能力 | 配置 |
|---|---|
| Unit 加载 | `unit/type` URL 参数驱动官方 Data Loader |
| Snapshot | `/universer-api/snapshot` |
| HTTP submit | `/universer-api/comb` |
| WebSocket | `/universer-api/comb/connect` |
| Session ticket | `/universer-api/user/session-ticket` |
| Authz | `/universer-api/authz` |
| Edit history | `/universer-api/history` |
| Offline editing | 开启 |
| Single-active lock | 开启 |
| HTTP override | 配置与上游一致，但 alpha.7 运行时实际仍使用 XHR |
| Collaboration Facade | 已导入 |

### Sheet 插件

客户端已经装配与服务端 Apply Host 对称的数据插件和相应 UI：

- Formula、Numfmt。
- Conditional Formatting、Data Validation。
- Filter、Sort、Hyperlink、Note。
- Drawing、Shape、Chart、Sparkline。
- Outline、Pivot Table、Table。
- Thread Comment UI 与官方远端 datasource。

Find/Replace、Crosshair、Range Preprocess 和 Live Share 是客户端能力，不要求服务端
存在同名插件。

### Worker

主编辑器使用独立 RPC Worker 执行 Formula、Filter 和 Pivot 相关计算；Edit History
打开时使用同一份 worker bundle 创建独立 Worker。

Worker URL 由 Vite 生成后交给 `UniverRPCMainThreadPlugin`。由插件在自己的生命周期内
创建 Worker，避免提前 `new Worker()` 与 URL Data Loader 初始化产生竞态。

## 有意保留的差异

### 不在当前范围的能力

以下插件和入口没有注册：

- 文件上传、签名 URL、Import/Export。
- Print、Watermark。
- Telemetry、Debugger、Action Recorder。

Thread Comment 已使用本仓库的 Comment Endpoint/Service/SQLite Adapter；固定身份示例没有
mention 用户搜索，因此评论可用，但 `@mention` 候选保持禁用。页面不会展示其余当前后端
无法完整支持的入口。

### Demo 与构建设施

- 使用 Vite，不复制上游 example 的 esbuild 和开发服务器。
- `lazy.ts` 保留上游的插件分类，但启动时立即注册，不人为等待三秒。
- 使用 English locale 和 `defaultTheme`，不依赖上游 mockdata locale 与
  `greenTheme`。
- 图片 I/O 暂时禁用；Drawing、Shape 和 Chart 的模型及协同 mutation 仍然启用。
- 用户固定为 `demo-user`，不实现 OIDC；真实认证由 `basic-sheets-auth` 演示。
- Unit 创建不支持 Action Recorder template。

### SDK 产物

上游 example 直接运行 workspace 源码，本 example 精确依赖 npm
`1.0.0-alpha.7`。两者 package version 声明相同，但不应假设发布产物与持续移动的
workspace 源码逐字一致；升级时必须同时记录上游 commit 并重新执行浏览器验收。

### HTTP implementation

`UniverCollaborationClientPlugin` 中的 `FetchHTTPImplementation` override 与上游
配置一致，但真实浏览器运行时仍解析为 `XHRHTTPImplementation`。当前同源 demo
不受影响，暂不修改初始化顺序。证据与后续方向见
[known issue](../../docs/issues/known-issues/collaboration-client-fetch-http-override-ineffective.md)。

### Formula quota

`collaboration-client-ui` 会访问 `/license/formula/limit/start`、`status` 和
`done`。额度服务不属于 Collaboration Service、Endpoint 或 Transport，当前 demo
不提供兼容接口，因此这些请求会返回 404。alpha.7 当前按默认
`maxFormulaLimit = 0`（unlimited）继续计算，已验证公式计算、协同提交和刷新恢复
不受影响；未来升级 SDK 时需要重新验证该容错行为。

## 保留原则

- 不手动调用 `loadSheetAsync()`，正常启动始终由 URL Data Loader 加载。
- 不访问 `ILocalCacheService` 或 `CollaborationController` 改变协同内部状态。
- 不增加 peer restore workaround。
- 不为 demo 差异修改 changeset、snapshot 或 Comb 协议。
