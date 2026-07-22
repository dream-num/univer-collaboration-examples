# JWT + Memory ACL 可运行协同示例

这是一个完全本地运行的最小协同应用：Express 承载业务 API 和静态页面，JWT 放在 HttpOnly Cookie，协同数据使用 Memory Adapter，浏览器使用真实 Univer 前端协同 SDK。

## 启动

在仓库根目录执行：

```bash
pnpm install
pnpm example:jwt-memory-auth
```

打开 <http://localhost:3010>。默认监听 `127.0.0.1:3010`；可用 `PORT`、`HOST` 环境变量修改。

演示账号：

| username | password | userId |
|---|---|---|
| alice | alice-password | user-alice |
| bob | bob-password | user-bob |
| carol | carol-password | user-carol |

进程重启后用户之外的 Unit、ACL 和协同数据都会清空。

## 双客户端验证

1. 在第一个浏览器会话登录 Alice，点击“创建 Sheet”。
2. 复制页面上的 `unitID`，给 Bob 分配 `editor`。
3. 在无痕窗口登录 Bob，输入相同 `unitID` 并打开。
4. 两端应显示 `sync: synced` 和在线成员 `alice, bob`。
5. 任一端修改单元格，另一端会收到 confirmed changeset。
6. 给 Carol 分配 `viewer` 后用第三个会话打开；UI 为只读，Service middleware 仍是权限安全边界。

浏览器断线重连后会通过 revision 和 fetch-missing 补齐漏掉的 changeset。为了调试，页面把当前 Facade API 暴露为 `window.univerAPI`。

## 集成边界

```text
Express application
├── /api/login、Unit 和成员管理 API
└── Node Transport
    └── UniverCollabEndpoint
        └── UniverCollabService
            └── MemoryDatabaseAdapter
```

- Express 不是协同框架依赖，只是这个示例的宿主。
- Transport middleware 认证 HTTP 请求，把可信 `userId` 和用户对象放入 event `customData`。
- Endpoint 签发一次性 ticket，并在 WebSocket open 时创建 Session/member。
- Service middleware 在 read/create/submit/apply 生命周期查询 ACL。
- `admin/editor/viewer` 使用稳定 `userId` 关联，不使用可修改的 `username`。
- viewer 前端只读是 UX；伪造网络提交仍由后端 `submitChangeset/applyChangeset` 拒绝。

## 认证与 Session

登录验证 `username/password` 后，JWT `sub` 保存 `userId`，token 只写入 HttpOnly Cookie。前端不读取 JWT。

```ts
transport.use(async (ctx, next) => {
  if (ctx.kind === 'http') {
    const user = await auth.requireUser(ctx.incomingMessage);
    ctx.userId = user.userId;
    ctx.customData.user = user;
  }
  await next();
});
```

请求 session-ticket 时，Endpoint 保存这次认证产生的 `userId/customData`。WebSocket 使用 ticket 建连后，Endpoint 创建长期 Session；普通 snapshot HTTP read 则使用短生命周期调用 Session。

## 权限 middleware

```ts
collabService.use('submitChangeset', async (ctx, next) => {
  const role = access.getRole(
    ctx.session.userId,
    ctx.request.changeset.unitID
  );
  ctx.request.customData.role = role;

  if (role !== 'admin' && role !== 'editor') {
    throw new CollabError('PERMISSION_DENIED', 'Unit is read-only');
  }
  await next();
});
```

同一个 SubmitChangesetRequest 继续进入 `applyChangeset/commitChangeset/Database/changesetCommitted`，并始终保留相同的 Session、Request 和 `request.customData` 引用。

## 关键目录

```text
server/
├── express-server.ts   可测试的应用装配、业务 API 与 shutdown
├── auth.ts             JWT、HttpOnly Cookie 和用户解析
├── memory-stores.ts    bcrypt 密码哈希和 userId ACL
├── collaboration.ts    Service/Endpoint 权限 middleware
└── sheet-snapshot.ts   Workbook data → Univer protocol snapshot

client/
├── main.ts             登录、创建、授权和页面交互
├── auth.ts             应用业务 API
└── univer.ts           Preset、协同 plugins、loadSheetAsync 和 viewer 只读
```

## 测试

```bash
pnpm --filter @univerjs/collaboration-example-jwt-memory-auth test
```

集成测试覆盖错误/成功登录、HttpOnly Cookie、未认证协同请求、创建真实 Sheet snapshot、admin/editor/viewer ACL、viewer 服务端拒绝和 session ticket。

本示例只适合本地演示。生产环境应替换 JWT secret、Memory stores 和 Memory Adapter，并配置 HTTPS、CSRF、防暴力破解及按部署方式选择 Cookie `SameSite/Secure`。
