# JWT + 内存用户与文档权限集成示例

这个示例只展示关键集成代码，不要求直接运行。协同框架本身不依赖 Express；Express 只是宿主应用。

## 数据模型

```ts
interface CreateUserInput {
  userId: string;   // 稳定业务主键
  username: string; // 登录名
  password: string; // 存储前进行哈希
}
```

文档权限使用稳定 `userId`，不使用可修改的 `username`：

```ts
interface DocumentGrant {
  userId: string;
  unitID: string;
  role: 'admin' | 'editor' | 'viewer';
}
```

登录提交 `username/password`。验证成功后 JWT `sub` 写入 `userId`；Session、ACL 和 confirmed changeset 作者都使用 `userId`。

## 后端集成

### 1. 登录与 JWT

```text
POST /api/login { username, password }
  → MemoryUserStore 验证密码哈希
  → JWT sub = userId
  → Set-Cookie: collab_token=<jwt>; HttpOnly
```

### 2. Transport 认证

Node Transport 为每个网络事件创建 context 和 customData。应用只认证 HTTP 请求；WebSocket open 使用 Endpoint 的一次性 ticket：

```ts
transport.use(async (ctx, next) => {
  if (ctx.kind === 'http') {
    const user = await auth.requireUser(ctx.incomingMessage);

    ctx.userId = user.userId;
    ctx.customData.user = user;
  }

  await next();
});

transport.use(new UniverCollabEndpoint(collabService));
```

Transport 不理解 Univer 协议。Endpoint 签发/消费 ticket、创建 WebSocket Session 和 `memberId`，再调用 Service。

应用可以在 Endpoint connect 生命周期中补充协议成员展示信息，而不修改 `CollabSession`：

```ts
endpoint.use('connect', async (ctx, next) => {
  const user = ctx.session.customData.user as AuthenticatedUser;
  ctx.member.name = user.username;
  await next();
});
```

### 3. Request 权限 middleware

Endpoint 或直接调用方把 Session、Input 和本次 customData 传给 Service；Service 创建 Request：

```ts
collabService.use('submitChangeset', async (ctx, next) => {
  ctx.request.customData.traceId = randomUUID();

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

同一个 SubmitChangesetRequest 继续进入 `applyChangeset/commitChangeset/Database/changesetCommitted`。这些阶段看到同一个 Session、Request 和 request customData 引用。

### 4. Express 业务 API

普通 `/api/*` 使用应用自己的 Express 认证 middleware。直接调用 Service 时由应用提供 Session：

```ts
const session = {
  memberId: randomUUID(),
  userId: user.userId,
  customData: { user },
};

await collabService.createUnit(
  {
    snapshot,
  },
  {
    session,
    customData: { traceId: randomUUID() },
  }
);
```

Service 不创建或关闭 Session。传入的调用级 `customData` 直接成为 `request.customData`。

## 两级 customData

```text
session.customData              Session 内所有 Request 共享
request.customData              当前 Request 独占
```

- 用户信息和认证方式适合 Session customData。
- trace、ACL 结果和请求缓存适合 Request customData。
- customData 不自动持久化；持久化审计数据写入应用自己的业务存储。

## 前端集成

1. 调用应用 `/api/login`。
2. 注册 Univer 协同插件。
3. 加载协同 Unit；HTTP 和 WebSocket 自动携带 Cookie。
4. 成员管理 API 使用目标 `userId`。
5. viewer 在前端设置只读 UI，后端 middleware 保持真正安全边界。

前端不读取 JWT，也不能提供可信 Session/Request customData 或身份；Endpoint 根据认证结果创建 Session，并覆盖网络 payload 中不可信的身份字段。

## 目录

```text
server/
├── model.ts            userId/username/password、角色
├── memory-stores.ts    内存用户与 userId 文档 ACL
├── auth.ts             密码验证、JWT 和 Cookie
├── collaboration.ts    Service middleware
└── express-server.ts   登录、Endpoint、Transport 和业务 API

client/
├── auth.ts             登录与按 userId 管理成员
├── main.ts             前端集成顺序
└── univer.ts           协同插件、Unit 加载和 viewer UI
```

跨域部署还需要 credential CORS 和 `SameSite=None; Secure`，本示例只展示同源集成。
