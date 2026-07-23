# Basic Sheets 客户端差异清单

本文对比：

- 当前 example：`univer-collaboration/examples/basic-sheets`
- 参考实现：`univer-pro/examples/src/sheets`

这些内容是待逐项评审的客户端差异，不自动等同于 issue。只有确认属于缺陷后，
才按照仓库规则归入 `docs/issues/known-issues` 或 `docs/issues/new-issues`。

## 已对齐的协同主链路

当前 example 直接使用官方：

- `@univerjs-pro/collaboration`
- `@univerjs-pro/collaboration-client`
- `@univerjs-pro/collaboration-client-ui`

以下协同配置已经对齐：

| 能力 | 当前状态 |
|---|---|
| Unit 加载 | URL 中的 `unit/type` 驱动 `CollaborationDataLoaderController` 自动加载 |
| Snapshot | `/universer-api/snapshot` |
| HTTP submit | `/universer-api/comb` |
| WebSocket | `/universer-api/comb/connect` |
| Session ticket | `/universer-api/user/session-ticket` |
| Authz | `/universer-api/authz` |
| Edit history | `/universer-api/history` |
| Socket service | `BrowserCollaborationSocketService` |
| Offline editing | 开启 |
| Single-active lock | 开启 |
| 当前用户 | 请求 `/universer-api/user` 后写入 `UserManagerService` |
| 协议对象 | 直接使用官方 changeset、snapshot 和 Comb 协议 |

因此当前没有实现另一套前端协同引擎；差异集中在 SDK 基线、插件装配和产品能力。

## 待逐项处理的差异

### 1. SDK 代码基线

当前 example 固定依赖 npm `1.0.0-alpha.6`。对比时，本地 `univer-pro` workspace
中 collaboration、collaboration-client 和 collaboration-client-ui 的包版本声明为
`1.0.0-alpha.4`，且上游 example 直接使用 workspace 源码。

影响：

- 两边不是严格相同的构建产物。
- 行为差异不能只从插件配置推断，也可能来自 SDK 代码版本。

待确认：

- [ ] example 长期跟随 npm 发布版，还是本地开发时对齐 `univer-pro` workspace。
- [ ] 建立明确的 SDK 升级和兼容验证方式。

### 2. Univer 初始化方式

当前使用：

```ts
createUniver({
  presets: [UniverSheetsCorePreset(...)],
  plugins: [...],
});
```

上游使用 `new Univer()` 后逐个 `registerPlugin()`。

当前 Preset 方式更接近普通 SDK 用户的集成方式，尚未发现它会改变核心协同协议。

待确认：

- [ ] 保持面向用户的 Preset 方式，还是为了示例源码一致改为手动注册。

### 3. Sheet 产品能力

当前只启用 Core Sheet 和协同、历史能力。上游还启用：

- Conditional Formatting、Data Validation、Filter、Sort
- Drawing、Note、Thread Comment、Outline
- Pivot Table、Chart、Sparkline、Table、Shape
- Print、Import/Export、Find/Replace、Hyperlink
- Watermark、Telemetry、Debugger、Action Recorder、Live Share

当前后端没有 comments、upload、exchange 等对应服务，直接注册相关客户端插件会产生
无法处理的网络请求。

待确认：

- [ ] 按用户价值逐项选择要支持的产品功能。
- [ ] 每启用一个依赖远程服务的插件前，先明确后端 API 和数据正确性边界。
- [ ] 不为了源码表面一致一次性注册全部插件。

### 4. Worker 与公式引擎

上游注册 RPC Worker、`UniverProFormulaEnginePlugin` 和 History Worker。当前：

- 没有 `UniverRPCMainThreadPlugin`。
- 使用 Core Preset 的公式引擎。
- 没有给 Edit History Loader 配置 `workerURL`。

当前普通协同编辑可运行，但公式计算线程、Worker 数据同步、复杂历史处理和大型 Workbook
性能不与上游完全一致。

待确认：

- [ ] 是否加入 RPC/Formula Worker。
- [ ] 是否加入 History Worker。
- [ ] 加入 Worker 前明确 license、构建产物和部署路径。

### 5. HTTP 实现

上游显式使用：

```ts
[IHTTPImplementation, { useClass: FetchHTTPImplementation }]
```

当前使用 Core Preset 提供的 XHR 实现。同源、固定用户 demo 已验证可工作，但跨域
credentials、Cookie、取消请求和 interceptor 行为可能不同。

待确认：

- [ ] 对齐 `FetchHTTPImplementation`。
- [ ] 增加认证和跨域场景后重新验证 HTTP 行为。

### 6. Facade API

Core Preset 已引入普通 Sheet Facade，但当前没有显式引入：

```ts
import "@univerjs-pro/collaboration-client/facade";
```

URL 自动加载和实时协同不依赖该 Facade；但 `window.univerAPI` 不保证包含上游全部
Pro Facade 扩展，例如 `getCollaboration()`。当前也没有 chart、pivot、print、
live-share 等 Facade。

待确认：

- [ ] example 是否需要公开演示 Collaboration Facade。
- [ ] 只随实际启用的产品插件导入对应 Facade。

### 7. 用户与认证

两边前端都会请求 `/universer-api/user` 并设置当前用户。当前后端固定：

```text
userId = demo-user
authz = allowed
```

当前不使用 Cookie、JWT 或 OIDC，创建 Unit 也没有上游的 401 登录跳转流程。

待确认：

- [ ] Basic Sheets 是否始终保持固定用户的最小定位。
- [ ] 真实认证和 ACL 是否只由 `jwt-memory-auth` 及后续产品 example 演示。
- [ ] 如果 Basic Sheets 引入认证，再对齐 401/OIDC 客户端流程。

### 8. 创建 Unit

当前创建请求使用固定 `demo-user`，不处理 `record` 参数或 template。上游支持
`record=e2e-template` 相关流程。

Service 最终以可信 Session 的 `userId` 为作者，不信任客户端 `creator`。

待确认：

- [ ] 是否移除创建请求中没有权威作用的 `creator`。
- [ ] 是否需要 template 或 Action Recorder 场景。

### 9. UI、主题和 locale

当前使用 `defaultTheme`、English locale 和最小全屏容器。上游使用 `greenTheme`，
并包含更完整的中英文 locale、Debugger 和延迟加载插件。

待确认：

- [ ] 是否对齐主题。
- [ ] 是否加入中文 locale。
- [ ] Debugger 和测试工具是否应该留在独立开发 example。

## 当前保留原则

在逐项评审完成前：

- 不手动调用 `loadSheetAsync()`，继续使用 URL Data Loader。
- 不访问 `ILocalCacheService` 或 `CollaborationController` 改变协同内部状态。
- 不增加 peer restore workaround；该问题仍按 known issue 单独处理。
- 不注册后端没有实现的远程产品插件。
- 不为了对齐 example UI 改造 changeset、snapshot 或 Comb 协议。
