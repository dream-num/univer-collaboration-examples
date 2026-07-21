import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import express from "express";
import {
  CollabError,
  type IDatabaseAdapter,
} from "@univerjs/collaboration-server";
import { createNodeCollabTransport } from "@univerjs/collaboration-server-node";
import type {
  AuthenticatedUser,
  DocumentRole,
  UnitKey,
} from "./model";
import { canAdmin } from "./model";
import { AuthService } from "./auth";
import { createCollaboration } from "./collaboration";
import { MemoryDocumentAccessStore, MemoryUserStore } from "./memory-stores";

const NAMESPACE = "demo-workspace";

const users = new MemoryUserStore();
const access = new MemoryDocumentAccessStore();
const auth = new AuthService(
  users,
  new TextEncoder().encode("replace-with-32-byte-secret")
);

// 代表任意 IDatabaseAdapter 实现。
declare const database: IDatabaseAdapter;
const collaboration = createCollaboration(database, access);

const transport = createNodeCollabTransport({
  server: collaboration,
});

// 每个协同 HTTP 请求或 WebSocket upgrade 执行一次。
// 应用认证用户并提供 SessionInit；Core 生成可信 memberId。
transport.use(async (ctx, next) => {
  let user: AuthenticatedUser;
  try {
    user = await auth.requireUser(ctx.incomingMessage);
  } catch (cause) {
    throw new CollabError("UNAUTHENTICATED", "Authentication required", {
      cause,
    });
  }

  ctx.namespace = NAMESPACE;
  ctx.userId = user.userId;
  ctx.customData.user = user;

  await next();
});

const app = express();
app.use(express.json());

// 登录成功后 JWT 被写入 HttpOnly Cookie。
app.post("/api/login", async (request, response) => {
  const { username, password } = request.body as {
    username: string;
    password: string;
  };

  try {
    const { token, user } = await auth.login(username, password);
    auth.setLoginCookie(response, token);
    response.json(user);
  } catch {
    response.status(401).json({ error: "Invalid username or password" });
  }
});

// 普通业务 API 继续使用应用自己的 Express 认证 middleware。
app.use("/api", async (request, response, next) => {
  try {
    response.locals.user = await auth.requireUser(request);
    next();
  } catch {
    response.status(401).json({ error: "Please sign in" });
  }
});

// 创建 unit；创建者自动获得 admin 角色。
app.post("/api/units", async (request, response) => {
  const user = response.locals.user as AuthenticatedUser;
  const unitId = randomUUID();
  const key: UnitKey = { namespace: NAMESPACE, unitId };

  access.grant(user.userId, key, "admin");
  try {
    const session = await collaboration.openSession({
      namespace: NAMESPACE,
      userId: user.userId,
      initialCustomData: { user },
    });
    try {
      await session.createUnit({
        unitId,
        type: 2,
        data: createEmptyWorkbookData(unitId),
      });
    } finally {
      await session.close();
    }
    response.status(201).json({ unitId });
  } catch (error) {
    access.revoke(user.userId, key);
    throw error;
  }
});

// 前端读取自己的角色，用于配置 viewer 只读 UI。
app.get("/api/units/:unitId/access", async (request, response) => {
  const user = response.locals.user as AuthenticatedUser;
  const key: UnitKey = {
    namespace: NAMESPACE,
    unitId: request.params.unitId,
  };
  const role = access.getRole(user.userId, key);

  if (!role) {
    response.status(403).json({ error: "Cannot read this unit" });
    return;
  }

  response.json({ role });
});

// 只有 admin 可以为其他用户分配文档角色。
app.put(
  "/api/units/:unitId/members/:userId",
  async (request, response) => {
    const user = response.locals.user as AuthenticatedUser;
    const key: UnitKey = {
      namespace: NAMESPACE,
      unitId: request.params.unitId,
    };

    if (!canAdmin(access.getRole(user.userId, key))) {
      response.status(403).json({ error: "Only admins can manage members" });
      return;
    }

    const { role } = request.body as { role: DocumentRole };
    access.grant(request.params.userId, key, role);
    response.status(204).end();
  }
);

// Express 只是宿主框架：将协同路径交给只依赖 Node HTTP 的 Transport。
app.use((request, response, next) => {
  if (!request.path.startsWith("/universer-api/")) {
    next();
    return;
  }

  transport.handleRequest(request, response);
});

const httpServer = createServer(app);

// WebSocket upgrade 不经过 Express，由同一个 Node Transport 处理。
httpServer.on("upgrade", (request, socket, head) => {
  if (!request.url?.startsWith("/universer-api/")) {
    return;
  }

  transport.handleUpgrade(request, socket, head);
});

async function bootstrap(): Promise<void> {
  // Demo 账号；真实服务不应在源码中保存密码。
  await users.create({
    userId: "user-alice",
    username: "alice",
    password: "alice-password",
  });
  await users.create({
    userId: "user-bob",
    username: "bob",
    password: "bob-password",
  });

  httpServer.listen(3010);
}

void bootstrap();

// 为突出集成边界，省略错误处理中间件和空 Workbook 构造函数。
declare function createEmptyWorkbookData(unitId: string): unknown;
