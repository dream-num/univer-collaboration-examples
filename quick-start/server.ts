import { createRequire } from "node:module";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IWorkbookData } from "@univerjs/core";
import express from "express";

// 当前 tsx 与 Univer SDK 的 ESM 入口不兼容，暂时改走 package 的 CommonJS 入口。
const sdkRequire = createRequire(import.meta.url);
const { LocaleType } = sdkRequire("@univerjs/core") as typeof import("@univerjs/core");
const { MemoryDatabaseAdapter } = sdkRequire(
  "@univerjs-pro/collaboration-database-memory"
) as typeof import("@univerjs-pro/collaboration-database-memory");
const { UniverCollabEndpoint } = sdkRequire(
  "@univerjs-pro/collaboration-endpoint"
) as typeof import("@univerjs-pro/collaboration-endpoint");
const { UniverCollabService } = sdkRequire(
  "@univerjs-pro/collaboration-service"
) as typeof import("@univerjs-pro/collaboration-service");
const { createNodeTransport } = sdkRequire(
  "@univerjs-pro/collaboration-transport-node"
) as typeof import("@univerjs-pro/collaboration-transport-node");
const { ErrorCode, UniverType } = sdkRequire(
  "@univerjs/protocol"
) as typeof import("@univerjs/protocol");
const userID = "demo-user";
const unitID = "quick-start-sheet";
const ok = { code: ErrorCode.OK, message: "" };

// Service 负责协同数据；Memory Adapter 让示例无需准备数据库。
const database = new MemoryDatabaseAdapter();
const service = new UniverCollabService({ dbAdapter: database });
// 启动时创建固定 Sheet，实际应用通常在自己的业务接口中创建 Unit。
await service.createUnitFromData(
  {
    type: UniverType.UNIVER_SHEET,
    data: {
      id: unitID,
      rev: 1,
      name: "Quick Start Sheet",
      appVersion: "",
      locale: LocaleType.EN_US,
      sheetOrder: ["sheet-1"],
      sheets: {
        "sheet-1": {
          id: "sheet-1",
          name: "Sheet 1",
          rowCount: 100,
          columnCount: 26,
          cellData: {},
        },
      },
      styles: {},
      resources: [],
    } satisfies IWorkbookData,
  },
  { userID }
);

// Endpoint 把 Univer 前端协议转换成 Service 调用。
const endpoint = new UniverCollabEndpoint(service);
// Transport 接收原始 Node HTTP 和 WebSocket 事件。
const transport = createNodeTransport();
transport.use(async (context, next) => {
  // HTTP 身份用于 Service 调用和签发 ticket；WebSocket 会通过 ticket 继承它。
  if (context.kind === "http") context.userID = userID;
  await next();
});
// 注册后，Endpoint 只处理它认识的固定协议路径和 WebSocket 消息。
transport.use(endpoint);

const app = express();
app.get("/", (request, response, next) => {
  if (request.query.unit) {
    next();
    return;
  }
  response.redirect(`/?unit=${unitID}&type=${UniverType.UNIVER_SHEET}`);
});
// Authz 只控制前端权限体验；Quick Start 固定允许所有 action。
app.post(
  "/universer-api/authz/-/object/-/batch_allowed",
  express.json(),
  (request, response) => {
    const body = request.body as {
      readonly requests: readonly {
        readonly unitID: string;
        readonly objectID: string;
        readonly actions: readonly unknown[];
      }[];
    };
    response.json({
      error: ok,
      objectActions: body.requests.map((item) => ({
        unitID: item.unitID,
        objectID: item.objectID,
        actions: item.actions.map((action) => ({ action, allowed: true })),
      })),
    });
  }
);
app.use("/universer-api", (request, response) => {
  // Express mount 会移除路径前缀，Endpoint 需要看到完整协议 URL。
  request.url = request.originalUrl;
  transport.handleRequest(request, response);
});

const clientDirectory = join(dirname(fileURLToPath(import.meta.url)), "dist/client");
app.use(express.static(clientDirectory));
app.use((_request, response) => {
  response.sendFile(join(clientDirectory, "index.html"));
});

const server = createServer(app);
server.on("upgrade", (request, socket, head) => {
  // WebSocket upgrade 与普通 HTTP 使用同一个 Transport/Endpoint。
  transport.handleUpgrade(request, socket, head);
});

const host = "127.0.0.1";
const port = Number(process.env.PORT ?? 3010);
server.listen(port, host, () => {
  console.info(`Quick Start is running at http://${host}:${port}`);
});
