# 多节点部署

[English](./README.md) | 简体中文

在一个网关后面运行多个协同服务节点。所有节点共用一个数据库和一个 Redis：Redis 负责在节点之间传递实时消息并保存会话票据，因此任何节点都能处理任何请求。`@univerjs-pro/collaboration-cluster-redis` 提供了 Redis 适配器。

本例用 Docker Compose 运行两个协同服务节点、两个副本的独立导入导出（exchange）服务、PostgreSQL、Redis 和 Nginx，并提供简单的 Sheet 创建和文件列表，方便观察路由、验证多人协同，以及导入导出 XLSX 文件。

## 部署结构

```mermaid
flowchart LR
    Browser["浏览器"] --> Gateway["网关（Nginx）"]
    subgraph nodes["协同服务节点"]
        A["node-a"]
        B["node-b"]
    end
    Gateway --> A
    Gateway --> B
    subgraph exchange["导入导出服务"]
        X1["exchange ×2"]
    end
    Gateway --> X1
    subgraph shared["所有节点共用"]
        Redis[("Redis<br/>pub/sub + 会话票据")]
        DB[("数据库<br/>+ exchange 任务与文件")]
    end
    A --- Redis
    B --- Redis
    A --- DB
    B --- DB
    X1 --- DB
```

- **协同服务节点**运行同样的代码，连接同一个 `DATABASE_URL` 和同一个 `REDIS_URL`。节点可以随时增减，没有任何状态绑定在某个节点上。
- **Redis** 需要 6.2 及以上。请以高可用方式运行 Redis：Redis 不可用时，签票请求失败，WebSocket 建连返回可重试的 `503`。
- **数据库**必须让所有协同服务节点都能访问，并满足 SDK 数据库适配器契约。本例使用 PostgreSQL，适配器为 [`server/postgres-database-adapter.ts`](./server/postgres-database-adapter.ts)，复制自 [`database-adapter`](../database-adapter/README.zh-CN.md) 示例中的自定义适配器；应用的文件目录表也放在同一个数据库中。节点不负责建表：[`schema.sql`](./schema.sql) 在 PostgreSQL 首次初始化数据目录时执行一次，节点启动时只检查表是否存在。在示例之外，请用迁移工具管理这份 schema，并把迁移作为独立的部署步骤执行，而不是由服务自己建表。
- **导入导出服务**是同一份代码的第二个入口 [`server/exchange-main.ts`](./server/exchange-main.ts)，与协同节点分开部署、独立扩缩容，见[独立运行导入导出](#独立运行导入导出)。它连接同一个 `DATABASE_URL`，不使用 Redis。
- **网关**把同一文档的 WebSocket 和提交发到同一个节点，把 exchange 路径发到 exchange 副本，其余请求随意分配，见[配置网关](#配置网关)。可以换成任何网关或负载均衡；使用 Kubernetes 时由平台管理副本，套用同样的路由规则。

## 配置每个协同服务节点

在 Endpoint 旁边安装适配器包和 Redis 客户端：

```bash
pnpm add @univerjs-pro/collaboration-endpoint @univerjs-pro/collaboration-cluster-redis redis
```

[`server/main.ts`](./server/main.ts) 创建一个 Redis 连接用于命令，再复制一个专门用于订阅，构造两个适配器后传给 Endpoint：

```ts
const redis = createClient({ url: redisURL });
const redisSubscriber = redis.duplicate();
await Promise.all([redis.connect(), redisSubscriber.connect()]);
const pubSub = new RedisPubSubAdapter({ pubClient: redis, subClient: redisSubscriber });
const ticketStore = new RedisSessionTicketStore({ client: redis });
const endpoint = new UniverCollabEndpoint(service, { pubSub, ticketStore });
```

也支持 `ioredis` 和 Redis Cluster，见 `@univerjs-pro/collaboration-cluster-redis` 的 README。

Endpoint 不会释放外部传入的适配器和客户端。停止服务时按创建的反序释放：先释放 Transport，再释放 pub/sub 适配器，最后关闭两个 Redis 连接。

## 配置网关

把同一文档的 WebSocket 和提交固定到一个节点：提交确认和广播在本地直接推送，并且只有这个节点把文档加载进内存。其余请求发到任何节点都可以。

提交请求的路径已经包含 unitID。WebSocket 的路径不含，所以 [`web/main.ts`](./web/main.ts) 给它追加 `unit` 参数，SDK 会保留这个参数：

```ts
const routingQuery = new URLSearchParams({ unit: unitID }).toString();
const connectionConfig = {
  collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
  wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
};
```

[`nginx.conf`](./nginx.conf) 把两者映射成同一个路由键，用 `hash $routing_unit consistent` 分配：

| 请求 | 分配方式 |
| --- | --- |
| WebSocket `/universer-api/comb/connect` | 按 query `unit` 一致性哈希 |
| 协同提交 `new_changes` | 按路径 `unitID` 一致性哈希 |
| ticket、snapshot、block、fetchmissing | 轮询 |
| 页面、文件创建与列表、鉴权 | 轮询 |
| 上传 `/universer-api/stream/file/upload`、`/universer-api/exchange/`、`/universer-api/file/` | 在 exchange 副本之间轮询 |

`unit` 必须与当前文档 ID 一致；本例每个页面打开一份文档，切换文件时重新建连。访问权限由应用校验。如果网关会保持与上游的空闲连接，空闲超时要短于 Node.js 服务的 keep-alive 超时（默认 5 秒），否则会偶发 `502`。

exchange upstream 使用 `server exchange:3011 resolve` 配合 Docker DNS，让 Nginx 跟随副本集合的变化；exchange 的 location 把 `client_max_body_size` 提高到 `32m` 以容纳上传。每个 exchange 响应都带有 `X-Exchange-Instance` 头，标明处理它的副本。

Nginx 指令参考：[一致性哈希](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash)、[resolve](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve)、[WebSocket 代理](https://nginx.org/en/docs/http/websocket.html)。

## 独立运行导入导出

服务端导入导出基于 `@univerjs-pro/exchange-node`，它的转换器是 Rust 原生绑定，每个平台约 29 MB。一次转换是 CPU 密集型的，并把整个工作簿放在内存里；协同节点则主要在等待 socket，同时常驻许多小文档。两者的资源画像和负载曲线都不同，所以本例把 exchange 路由放在独立的服务里运行：

- 独立扩缩容：[`compose.yaml`](./compose.yaml) 中 `deploy.replicas: 2`，并限制 `cpus: 1`、`memory: 1g`，与协同节点数量无关；
- 一次耗时或失败的转换不会拖慢或拖垮正在服务 WebSocket 的节点；
- 协同镜像不包含原生绑定（见 [`Dockerfile`](./Dockerfile) 的 `collab` target）。

[`server/exchange-main.ts`](./server/exchange-main.ts) 只装配数据库适配器、`UniverCollabService` 和 exchange 路由，没有 Endpoint、Transport 和 Redis。导入通过 `createUnitFromSnapshot()` 创建 Unit 并写入文件目录；导出通过 `getUnitLoadDataWithBlocks()` 和 `UnitSnapshotMaterializer` 读取最新已确认版本，不需要经过当前承载该文档的节点。

[`server/exchange.ts`](./server/exchange.ts) 实现 `UniverExchangeClientPlugin` 期望的协议：上传、返回任务 ID 的 `import`/`export`、任务轮询、签名 URL 和下载。它的全部状态都在 [`schema.sql`](./schema.sql) 定义的两张 PostgreSQL 表里，由 [`server/exchange-store.ts`](./server/exchange-store.ts) 读写：

| 表 | 内容 |
| --- | --- |
| `exchange_tasks` | `pending` → `running` → `done`（带 `result`）或 `failed`（带 `error`） |
| `exchange_files` | 上传的源文件（导入后删除）和导出结果 |

接收上传或发起任务的副本把状态写进共享数据库，因此任意副本都能应答这个任务的轮询或提供下载，网关才可以直接轮询分配。在浏览器的网络面板里观察 `X-Exchange-Instance`，可以看到同一次导入的上传、轮询和下载由不同副本处理。

本例保留了一处简化：转换在接收请求的副本内同步执行。进一步拆分时，保留这两张表，把文件字节从 `bytea` 列换成对象存储，并把 `startTask()` 改成向队列投递，由独立扩缩容的 worker 进程消费。如果副本在转换中途停止，它的任务会停留在 `running`；worker 方案需要加上租约或超时，让其他 worker 接手。

## 运行示例

准备 Docker 和 Docker Compose，在仓库根目录执行：

```bash
docker compose -f examples/multi-node/compose.yaml up --build --force-recreate
```

也可以运行 `pnpm example:multi-node`，依赖安装和构建都在容器内完成。使用独立 Compose 的环境，将 `docker compose` 替换为 `docker-compose`。

打开 <http://127.0.0.1:3010/>：

1. 点击 **New Sheet** 创建文件，侧栏会显示它分配到的节点，`node-a` 或 `node-b`。
2. 把完整 URL 复制到另一个标签页，编辑同一份 Sheet，观察同步。
3. 再创建几份文件，选择分配到另一节点的文件重复验证。
4. 打开一个文件后，通过 **File → Open (File)** 导入 XLSX/XLS/CSV/TSV。导入会创建一个以文件名命名的新 Unit 并列入侧栏，通知中带有它的链接。通过 **File → Save As** 把当前 Sheet 导出为 XLSX/CSV/TSV。

`GATEWAY_PORT` 可修改默认端口 `3010`；`UNIVER_LICENSE` 可在构建时传入许可证。更新代码后重新执行启动命令，会同时重建服务节点和 Nginx，避免网关保留旧容器地址；随后重新打开页面。

## 示例范围

- 节点拓扑固定：Nginx 不会把请求改发到另一个节点，示例也不提供自动故障接管。
- 使用固定用户和演示权限，只覆盖 Sheet 协同。
- 导入导出在接收请求的 exchange 副本内转换，文件字节存在 PostgreSQL 里，下载 URL 不签名。这些都是教学取舍，进一步的拆分方式见[独立运行导入导出](#独立运行导入导出)。

## 日志与停止

```bash
# 查看节点和 exchange 日志
docker compose -f examples/multi-node/compose.yaml logs -f node-a node-b exchange

# 停止服务，保留数据
docker compose -f examples/multi-node/compose.yaml down
```

需要清空演示数据时，在停止命令中加上 `--volumes`。
