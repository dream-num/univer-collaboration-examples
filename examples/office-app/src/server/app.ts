import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import express, { type Express } from "express";
import Database from "libsql";
import { createAuthRepository } from "./auth/auth.repository";
import { createAuthHttp } from "./auth/auth.routes";
import { createAuthService } from "./auth/auth.service";
import { createAuthzRepository } from "./authz/authz.repository";
import { createAuthzRouter } from "./authz/authz.routes";
import { AuthzError, createAuthzService } from "./authz/authz.service";
import { createCollaboration } from "./collaboration";
import { createCollaborationUsersRouter } from "./collaboration/users.routes";
import { config } from "./config";
import {
  createExchangeProtocolRouter,
  createExchangeRouter,
} from "./exchange/exchange.routes";
import {
  ExchangeHttpError,
  createExchangeService,
} from "./exchange/exchange.service";
import { initializeSchema } from "./schema";
import { createUnitOperations } from "./units/content";
import { createMembersRouter } from "./units/members.routes";
import { MemberError, createMembersService } from "./units/members.service";
import { createUnitsRouter } from "./units/units.routes";
import { createUnitRepository } from "./units/units.repository";
import { UnitError, createUnitsService } from "./units/units.service";

export async function createApp(): Promise<AppRuntime> {
  await mkdir(dirname(config.databaseFilename), { recursive: true });
  const database = new Database(config.databaseFilename);
  database.pragma("foreign_keys = ON");
  initializeSchema(database);

  const authService = createAuthService(createAuthRepository(database));
  const auth = createAuthHttp(authService);
  const repository = createUnitRepository(database);
  const authz = createAuthzService({
    repository: createAuthzRepository(database),
    units: repository,
  });
  const collaboration = createCollaboration({
    repository,
    authz,
    currentUser: auth.currentUser,
  });
  const units = createUnitOperations({
    service: collaboration.service,
    repository,
  });

  const unitsService = createUnitsService({
    repository,
    collabService: collaboration.service,
    createUnit: units.createUnit,
    // Endpoint 关闭既有连接，后续重连会重新执行 joinUnit ACL。
    invalidateUnitSessions: (input) =>
      collaboration.endpoint.invalidateUnitSessions(input),
  });
  const membersService = createMembersService({
    repository,
    invalidateUnitSessions: (input) =>
      collaboration.endpoint.invalidateUnitSessions(input),
  });
  const exchangeService = createExchangeService({
    captureSnapshot: units.captureSnapshot,
    importUnit: units.importUnit,
    getUnit: repository.getUnit.bind(repository),
  });

  const app = express();
  app.disable("x-powered-by");
  app.use("/api", express.json({ limit: "64kb" }));
  app.use("/universer-api/authz", express.json({ limit: "64kb" }));

  app.use("/api/auth", auth.router);
  app.use(
    "/api",
    createExchangeRouter({ service: exchangeService, requireUser: auth.requireUser }),
  );
  app.use(
    "/api/units/:unitId/members",
    createMembersRouter({
      service: membersService,
      requireUser: auth.requireUser,
    }),
  );
  app.use(
    "/api/units",
    createUnitsRouter({ service: unitsService, requireUser: auth.requireUser }),
  );
  app.use(
    "/universer-api/authz",
    createAuthzRouter({ requireUser: auth.requireUser, service: authz }),
  );
  app.use(
    "/universer-api/user",
    createCollaborationUsersRouter({
      repository,
      requireUser: auth.requireUser,
    }),
  );
  app.use(
    "/universer-api",
    createExchangeProtocolRouter({
      service: exchangeService,
      requireUser: auth.requireUser,
    }),
  );
  app.use("/universer-api", (request, response) => {
    request.url = request.originalUrl;
    collaboration.transport.handleRequest(request, response);
  });

  app.use(express.static("dist/web"));
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/")) {
      next();
      return;
    }
    response.sendFile("index.html", { root: "dist/web" });
  });
  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      if (
        error instanceof UnitError ||
        error instanceof MemberError ||
        error instanceof ExchangeHttpError ||
        error instanceof AuthzError
      ) {
        response.status(error.status).json({
          code: error.code,
          ...(error instanceof ExchangeHttpError && error.detail
            ? { message: error.detail }
            : {}),
        });
        return;
      }
      console.error(error);
      response.status(500).json({ code: "INTERNAL_ERROR" });
    },
  );

  return {
    app,
    collaboration,
    async dispose() {
      await collaboration.dispose();
      database.close();
    },
  };
}

export interface AppRuntime {
  app: Express;
  collaboration: ReturnType<typeof createCollaboration>;
  dispose(): Promise<void>;
}
