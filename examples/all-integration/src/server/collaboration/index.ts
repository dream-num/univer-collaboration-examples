import type { IncomingMessage } from "node:http";
import { SQLiteCommentDatabaseAdapter } from "@univerjs-pro/collaboration-comment-database-sqlite";
import { UniverCommentEndpoint } from "@univerjs-pro/collaboration-comment-endpoint";
import { UniverCommentService } from "@univerjs-pro/collaboration-comment-service";
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabEndpoint } from "@univerjs-pro/collaboration-endpoint";
import { SQLiteHistoryDatabaseAdapter } from "@univerjs-pro/collaboration-history-database-sqlite";
import { UniverHistoryEndpoint } from "@univerjs-pro/collaboration-history-endpoint";
import { UniverHistoryService } from "@univerjs-pro/collaboration-history-service";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";
import { createNodeTransport } from "@univerjs-pro/collaboration-transport-node";
import type { IUser } from "@univerjs/protocol";
import type { User } from "../../shared/api-types";
import type { AuthzService } from "../authz/authz.service";
import { config } from "../config";
import type { UnitRepository } from "../units/units.repository";
import {
  registerCollaborationAccess,
  registerCommentAccess,
  registerEndpointAccess,
  registerHistoryAccess,
} from "./access-control";

export function createCollaboration(options: {
  repository: UnitRepository;
  authz: AuthzService;
  currentUser: (request: IncomingMessage) => User | undefined;
}) {
  const database = new SQLiteDatabaseAdapter({
    filename: config.databaseFilename,
  });
  const service = new UniverCollabService({ dbAdapter: database, enableUnitPermissionAnalysis: true });
  const transport = createNodeTransport();

  service.on("changesetCommitted", (event) => {
    options.repository.touchUnit(event.changeset.unitID, event.committedAt);
    // Delete requirement 表示本次操作需要删除权，不表示 ACL 策略可以销毁。
    // 解除绑定后仍保留策略，撤销/重做与历史恢复会重新引用原 permissionId。
    // TODO：由应用按完整引用和历史保留策略回收孤立 ACL，不能根据单次提交推断。
  });
  registerCollaborationAccess(service, options.repository, options.authz);

  const userProvider = {
    async getUsers(userIDs: readonly string[]): Promise<readonly IUser[]> {
      return options.repository.getUsers(userIDs).map((user) => ({
        userID: user.userId,
        name: user.displayName,
        avatar: "",
        anonymous: false,
        canBindAnonymous: false,
        phone: "",
        email: "",
        createTimestamp: user.createdAt,
      }));
    },
  };

  transport.use(async (context, next) => {
    const user = options.currentUser(context.incomingMessage);
    if (!user) {
      context.response.statusCode = 401;
      context.response.setHeader("Content-Type", "application/json");
      context.response.end(JSON.stringify({ code: "AUTH_REQUIRED" }));
      return;
    }
    context.userID = user.userId;
    context.customData.currentUser = user;
    await next();
  });

  const endpoint = new UniverCollabEndpoint(service);
  endpoint.use("connect", async (context, next) => {
    const user = context.session.customData.currentUser as User;
    context.member.name = user.displayName;
    context.member.avatar = "";
    await next();
  });
  registerEndpointAccess(endpoint, options.repository);
  transport.register(endpoint);

  const commentDatabase = new SQLiteCommentDatabaseAdapter({
    filename: config.databaseFilename,
  });
  const commentService = new UniverCommentService({
    database: commentDatabase,
    userProvider,
  });
  registerCommentAccess(commentService, options.repository);

  const historyDatabase = new SQLiteHistoryDatabaseAdapter({
    filename: config.databaseFilename,
  });
  const historyService = new UniverHistoryService({
    collabService: service,
    dbAdapter: historyDatabase,
    userProvider,
  });
  registerHistoryAccess(historyService, options.repository);

  transport.register(new UniverCommentEndpoint({ service: commentService, roomHost: endpoint }));
  transport.register(new UniverHistoryEndpoint(historyService));

  async function dispose() {
    await transport.dispose();
    await commentService.dispose();
    await historyService.dispose();
    await commentDatabase.dispose();
    await historyDatabase.dispose();
    await service.dispose();
    await database.dispose();
  }

  return {
    service,
    endpoint,
    transport,
    dispose,
  };
}
