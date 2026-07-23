# Basic Sheets

最小的持久化 Univer Sheet 协同示例。浏览器使用现有 Univer Pro 协同客户端；服务器采用：

```text
Node Transport → UniverCollabEndpoint → UniverCollabService → SQLiteDatabaseAdapter
```

Express 只承载同源静态资源和把请求交给 Transport，不是框架依赖。

## 启动

要求 Node.js 24 和 pnpm 10。在仓库根目录执行：

```bash
pnpm install
pnpm --filter @univerjs/collaboration-example-basic-sheets build
pnpm --filter @univerjs/collaboration-example-basic-sheets start
```

打开 <http://127.0.0.1:3010>。没有 `unit` 参数时，页面会创建空 Sheet，并跳转到稳定的 `?unit=<unitID>&type=2` 地址。

若本地 Univer Pro 授权要求显式 license，在构建前设置：

```bash
VITE_UNIVER_LICENSE='your-license' pnpm --filter @univerjs/collaboration-example-basic-sheets build
```

`VITE_*` 会写入浏览器 bundle；不要把秘密凭据当作前端 license 注入。

## 演示协同与持久化

1. 在普通浏览器打开页面，等待 Sheet 加载。
2. 把完整 URL 复制到另一个浏览器或独立无痕会话；不同 Cookie 会产生不同的 `Guest A7F3` 风格身份。
3. 在任一端编辑单元格，另一端会收到 confirmed changeset，并能看到在线成员和 presence。
4. 刷新页面，或停止并重新启动服务器；URL、内容、revision 和历史记录保持不变。
5. 从 Univer 的版本历史入口查看历史，并恢复旧版本。恢复会生成新的最新 revision，不覆盖原历史。

运行时数据位于 `examples/basic-sheets/.data/`，不会提交到 Git：

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets seed
pnpm --filter @univerjs/collaboration-example-basic-sheets reset
```

`seed` 幂等初始化 schema 和 Cookie secret；`reset` 删除 demo SQLite 文件，下次启动重新创建。执行 reset 前先停止服务器。

## 身份与数据边界

- 首次 HTTP 请求创建 guest，并设置 `HttpOnly; SameSite=Lax` 的 HMAC 签名 Cookie。
- Cookie secret、guest、history metadata 与协同数据持久化在同一个 SQLite 文件，但使用独立的 `demo_*` 应用表。
- SQLite Adapter 只管理 Unit/snapshot/changeset/submission/block/resource 表；它不知道 guest 或历史展示模型。
- Transport 从 Cookie 得到可信 `userId`；session ticket 把身份传到 WebSocket Session；Endpoint 再调用 Service。
- 每个 confirmed changeset 的作者使用稳定 guest ID，而不是展示名称。

签名匿名 Cookie 只是减少 demo 的登录步骤，不是生产认证：任何拿到 Cookie 的人都代表该 guest，而且本示例没有 ACL。生产应用应接入真实会话、CSRF 防护、HTTPS、权限 middleware、密钥轮换和审计。

## 相对上游 Sheets example 的差异

前端以 `univer-pro/examples/src/sheets` 的协议和加载流程为基准，但刻意缩小产品面：

- 使用 `UniverSheetsCorePreset`，没有复制上游完整的手工 plugin 注册列表。
- 保留 Collaboration Client、Collaboration UI 与 Edit History；仍直接使用现有 snapshot、Comb、ticket 和 history 协议，没有前端转换层。
- `alpha.6` 的 History Loader 只在提交者 ACK 后刷新，peer 收到 remote restore mutation 时会进入不可恢复的 conflict。本 demo 用内部 Client API 检测该事件、把 Unit 的 offline cache 重置到 confirmed revision 并刷新页面。服务端保证该事件发出前新 revision snapshot 已持久化，因此前端不轮询 snapshot。
- 使用同源相对 HTTP URL，并从当前 origin 构造 WebSocket URL。
- 为无 ACL 的 demo 提供只返回 `allowed: true` 的最小 authz 查询兼容接口，并隐藏需要完整权限对象 CRUD 的 Sheet protection 菜单。
- 后端替换为本仓库的 Transport → Endpoint → Service 三层与 SQLite Adapter。
- 使用签名匿名 Cookie，不接入上游示例的 OIDC/业务用户系统。
- 去掉 comments、live share、chart、pivot、上传、授权管理等未由本 demo 提供后端能力的入口。
- 不注册 worker、telemetry、debugger 或 action recorder。
- 页面没有文件列表和产品壳；只有全屏 Sheet，以及加载/失败/重试状态。

因此，本示例证明的是现有 Sheet 协同客户端和历史 UI 的兼容性，不是上游完整 Sheets 产品能力的替代品。

上述 remote restore 处理是针对 `alpha.6` 的兼容 shim，不是推荐给业务代码的稳定前端 API；待 Collaboration Client 或 Edit History Loader 原生处理 peer restore 后应删除。

## 测试

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets test
```

测试使用临时 SQLite 文件与真实本机 HTTP/WebSocket：

- 签名 Cookie 的稳定、隔离和篡改处理。
- Unit/snapshot/history 在服务重启后的持久化。
- 两个 guest 并发提交的 ACK、广播和 OT 收敛。
- 在线成员、presence、断线、重连与 fetch-missing。
- revision 5 snapshot，以及恢复 revision 1 后产生新 revision 6。
- 恢复后的状态再次重启仍可正确加载。

当前 history metadata 由隔离的 `changesetCommitted` listener 写入应用表；极端进程故障可能造成展示 metadata 缺项，但 confirmed changeset 和 Unit 数据不受影响。生产应用若要求严格一致，应使用事务 outbox 或可重建的历史索引。
