import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { ErrorCode, UniverType } from "@univerjs/protocol";
import { CollabError } from "@univerjs/collaboration-service";
import { MemoryDatabaseAdapter } from "@univerjs/collaboration-database-memory";
import { UniverCollabEndpoint } from "@univerjs/collaboration-endpoint";
import { createNodeTransport } from "@univerjs/collaboration-transport-node";
import { AuthService } from "./auth.js";
import { createCollabService } from "./collaboration.js";
import { MemoryDocumentAccessStore, MemoryUserStore } from "./memory-stores.js";
import type { AuthenticatedUser, DocumentRole } from "./model.js";
import { canAdmin } from "./model.js";
import { createEmptyWorkbook } from "./sheet-snapshot.js";

const DEMO_USERS = [
  { userId: "user-alice", username: "alice", password: "alice-password" },
  { userId: "user-bob", username: "bob", password: "bob-password" },
  { userId: "user-carol", username: "carol", password: "carol-password" },
] as const;

export interface DemoApplicationOptions {
  readonly jwtSecret?: string;
  readonly serveClient?: boolean;
}

export interface DemoApplication {
  readonly app: express.Express;
  readonly httpServer: Server;
  readonly users: MemoryUserStore;
  readonly access: MemoryDocumentAccessStore;
  readonly database: MemoryDatabaseAdapter;
  readonly collabService: ReturnType<typeof createCollabService>;
  listen(port?: number, host?: string): Promise<number>;
  close(): Promise<void>;
}

export async function createDemoApplication(
  options: DemoApplicationOptions = {}
): Promise<DemoApplication> {
  const users = new MemoryUserStore();
  const access = new MemoryDocumentAccessStore();
  for (const user of DEMO_USERS) await users.create(user);

  const secret = new TextEncoder().encode(
    options.jwtSecret ?? "local-demo-secret-change-before-production"
  );
  const auth = new AuthService(users, secret);
  const database = new MemoryDatabaseAdapter();
  const collabService = createCollabService(database, access);
  const endpoint = new UniverCollabEndpoint(collabService);
  const transport = createNodeTransport();

  endpoint.use("connect", async (ctx, next) => {
    const user = ctx.session.customData.user as AuthenticatedUser | undefined;
    ctx.member.name = user?.username ?? ctx.session.userId;
    await next();
  });

  endpoint.use("joinUnit", async (ctx, next) => {
    if (!access.getRole(ctx.session.userId, ctx.unitID)) {
      throw new CollabError("PERMISSION_DENIED", "Cannot join this unit");
    }
    await next();
  });

  // The host authenticates HTTP. A WebSocket open is authenticated by the
  // one-time ticket that Endpoint issued for a previous authenticated request.
  transport.use(async (ctx, next) => {
    if (ctx.kind === "http") {
      try {
        const user = await auth.requireUser(ctx.incomingMessage);
        ctx.userId = user.userId;
        ctx.customData.user = user;
      } catch {
        ctx.response.statusCode = 401;
        ctx.response.setHeader("content-type", "application/json; charset=utf-8");
        ctx.response.end(JSON.stringify({
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: "Authentication required",
          },
        }));
        return;
      }
    }
    await next();
  });
  transport.use(endpoint);
  transport.use(async (ctx, next) => {
    if (ctx.kind === "http") {
      if (!ctx.response.writableEnded) {
        ctx.response.statusCode = 404;
        ctx.response.end("Not Found");
      }
      return;
    }
    if (ctx.kind === "websocket-open") {
      ctx.connection.close(1008, "Unknown collaboration endpoint");
      return;
    }
    await next();
  });

  const app = express();

  // Transport must see the raw stream before express.json() consumes it.
  app.use((request, response, next) => {
    if (!request.path.startsWith("/universer-api/")) {
      next();
      return;
    }
    transport.handleRequest(request, response);
  });

  app.use(express.json());

  app.post("/api/login", async (request, response) => {
    const { username, password } = request.body as Partial<{
      username: string;
      password: string;
    }>;
    if (typeof username !== "string" || typeof password !== "string") {
      response.status(400).json({ error: "username and password are required" });
      return;
    }
    try {
      const { token, user } = await auth.login(username, password);
      auth.setLoginCookie(response, token);
      response.json(user);
    } catch {
      response.status(401).json({ error: "Invalid username or password" });
    }
  });

  app.use("/api", async (request, response, next) => {
    try {
      response.locals.user = await auth.requireUser(request);
      next();
    } catch {
      response.status(401).json({ error: "Please sign in" });
    }
  });

  app.get("/api/me", (_request, response) => {
    response.json(response.locals.user as AuthenticatedUser);
  });

  app.post("/api/logout", (_request, response) => {
    auth.clearLoginCookie(response);
    response.status(204).end();
  });

  app.get("/api/users", (_request, response) => {
    response.json({ users: users.list() });
  });

  app.post("/api/units", async (request, response) => {
    const user = response.locals.user as AuthenticatedUser;
    const unitID = randomUUID();
    const name =
      typeof request.body?.name === "string" && request.body.name.trim()
        ? request.body.name.trim()
        : "Collaborative Sheet";
    access.grant(user.userId, unitID, "admin");
    try {
      const initial = await createEmptyWorkbook(unitID, name);
      await collabService.createUnit(initial, {
        session: applicationSession(user),
        customData: { traceId: randomUUID() },
      });
      response.status(201).json({
        unitID,
        type: UniverType.UNIVER_SHEET,
        role: "admin",
      });
    } catch (error) {
      access.revoke(user.userId, unitID);
      throw error;
    }
  });

  app.get("/api/units/:unitID/access", (request, response) => {
    const user = response.locals.user as AuthenticatedUser;
    const unitID = request.params.unitID as string;
    const role = access.getRole(user.userId, unitID);
    if (!role) {
      response.status(403).json({ error: "Cannot read this unit" });
      return;
    }
    response.json({ role });
  });

  app.put("/api/units/:unitID/members/:userId", (request, response) => {
    const user = response.locals.user as AuthenticatedUser;
    const unitID = request.params.unitID as string;
    if (!canAdmin(access.getRole(user.userId, unitID))) {
      response.status(403).json({ error: "Only admins can manage members" });
      return;
    }
    const targetUserId = request.params.userId as string;
    const role = request.body?.role as unknown;
    if (!users.getById(targetUserId)) {
      response.status(404).json({ error: "User not found" });
      return;
    }
    if (!isDocumentRole(role)) {
      response.status(400).json({ error: "Invalid role" });
      return;
    }
    access.grant(targetUserId, unitID, role);
    response.status(204).end();
  });

  if (options.serveClient !== false) {
    const clientDirectory = join(
      dirname(fileURLToPath(import.meta.url)),
      "../dist/client"
    );
    app.use(express.static(clientDirectory));
    app.get("/{*path}", (_request, response) => {
      response.sendFile(join(clientDirectory, "index.html"));
    });
  }

  app.use(
    (error: unknown, _request: Request, response: Response, next: NextFunction) => {
      if (response.headersSent) {
        next(error);
        return;
      }
      if (error instanceof CollabError) {
        response.status(error.code === "PERMISSION_DENIED" ? 403 : 400).json({
          error: error.message,
        });
        return;
      }
      console.error(error);
      response.status(500).json({ error: "Internal server error" });
    }
  );

  const httpServer = createServer(app);
  httpServer.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith("/universer-api/")) {
      socket.destroy();
      return;
    }
    transport.handleUpgrade(request, socket, head);
  });

  let closed = false;
  return {
    app,
    httpServer,
    users,
    access,
    database,
    collabService,
    listen: (port = 3010, host = "127.0.0.1") => listen(httpServer, port, host),
    close: async () => {
      if (closed) return;
      closed = true;
      await transport.dispose();
      await closeServer(httpServer);
      await collabService.dispose();
      await database.dispose();
    },
  };
}

function applicationSession(user: AuthenticatedUser) {
  return {
    memberId: `http-${randomUUID()}`,
    userId: user.userId,
    customData: { user },
  };
}

function isDocumentRole(value: unknown): value is DocumentRole {
  return value === "admin" || value === "editor" || value === "viewer";
}

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Server did not expose a TCP address"));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
