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
  unitKey: UnitKey;
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

Node Transport 创建 ingress context 和 customData。应用只补充字段：

```ts
transport.use(async (ctx, next) => {
  const user = await auth.requireUser(ctx.incomingMessage);

  ctx.namespace = NAMESPACE;
  ctx.userId = user.userId;
  ctx.customData.user = user;

  await next();
});
```

Transport 验证 identity 后调用 Core。Core 创建 Session 和最终 `session.customData`，并复制 ingress customData 字段。`memberId` 由 Core 生成。

### 3. Request 权限 middleware

Session 方法只接收 Input；Core 为每次调用创建 Request 和独立 customData：

```ts
server.use('submit', async (ctx, next) => {
  ctx.request.customData.traceId = randomUUID();

  const role = access.getRole(
    ctx.session.userId,
    ctx.request.unitKey
  );
  ctx.request.customData.role = role;

  if (role !== 'admin' && role !== 'editor') {
    throw new CollabError('PERMISSION_DENIED', 'Unit is read-only');
  }

  ctx.request.metadata.operator = ctx.session.userId;
  await next();
});
```

同一个 SubmitRequest 继续进入 `apply/commit/Database/afterWrite`。这些阶段看到同一个 Request 和 customData 引用。

### 4. Express 业务 API

普通 `/api/*` 使用应用自己的 Express 认证 middleware。直接调用 Core 时先打开短期 Session：

```ts
const session = await collaboration.openSession({
  namespace: NAMESPACE,
  userId: user.userId,
  initialCustomData: { user },
});

try {
  await session.createUnit({
    unitId,
    type,
    data,
  });
} finally {
  await session.close();
}
```

`initialCustomData` 只是初始字段。Core 创建自己的 customData 对象并复制字段，不采用调用者提供的顶层引用。

## 两级 customData

```text
session.customData              Session 内所有 Request 共享
request.customData              当前 Request 独占
```

- 用户信息和认证方式适合 Session customData。
- trace、ACL 结果和请求缓存适合 Request customData。
- customData 不自动持久化；持久化审计字段写入 Request metadata。

## 前端集成

1. 调用应用 `/api/login`。
2. 注册 Univer 协同插件。
3. 加载协同 Unit；HTTP 和 WebSocket 自动携带 Cookie。
4. 成员管理 API 使用目标 `userId`。
5. viewer 在前端设置只读 UI，后端 middleware 保持真正安全边界。

前端不读取 JWT，也不能提供 Session/Request customData 或可信 `userId/memberId`。

## 目录

```text
server/
├── model.ts            userId/username/password、角色
├── memory-stores.ts    内存用户与 userId 文档 ACL
├── auth.ts             密码验证、JWT 和 Cookie
├── collaboration.ts    Session/Request middleware
└── express-server.ts   登录、业务 API 和 Node Transport 接入

client/
├── auth.ts             登录与按 userId 管理成员
├── main.ts             前端集成顺序
└── univer.ts           协同插件、Unit 加载和 viewer UI
```

跨域部署还需要 credential CORS 和 `SameSite=None; Secure`，本示例只展示同源集成。
