# 多节点部署

[English](./README.md) | 简体中文

多节点部署可以将不同文档的协同负载分配到多个服务节点，分担单节点压力，提升整体并发处理能力。

本例使用 Nginx 将请求路由到两个协同服务节点，并提供简单的 Sheet 创建和文件列表，方便观察路由和验证多人协同。实际部署时，可以根据现有基础设施选择其他网关或负载均衡方案；使用 Kubernetes 等容器编排平台时，可由平台管理服务副本，并配置相应网关按 unitID 做一致性路由。

## 为什么需要按文档路由？

每个节点都给 Endpoint 传入共享的 pub/sub 适配器和共享的会话票据存储，签票、WebSocket 和广播都能跨节点工作；无论请求落在哪个节点，包括节点扩缩容时，已提交的数据都保持一致。

但同一文档的提交仍应落到同一个节点。不同节点并发提交同一文档时，Service 可能要求客户端重试（`changeset_should_retry`），而当前的协同客户端收到后不会重新提交，之后的修改只会留在本地。

出于性能考虑，仍然推荐按 **unitID（文档 ID）** 做一致性哈希。同一文档的 WebSocket 和提交落在同一节点时，广播和提交的确认都在本地直接推送；落在不同节点时，两者都要经 Redis 转发一次，多一次往返，而且每个加载了该文档的节点都要占用内存。

## 跨节点投递

[`server/main.ts`](./server/main.ts) 用 `@univerjs-pro/collaboration-cluster-redis` 创建基于 Redis 的适配器，并传给 Endpoint：

```ts
const redis = createClient({ url: redisURL });
const redisSubscriber = redis.duplicate();
await Promise.all([redis.connect(), redisSubscriber.connect()]);
const pubSub = new RedisPubSubAdapter({ pubClient: redis, subClient: redisSubscriber });
const ticketStore = new RedisSessionTicketStore({ client: redis });
const endpoint = new UniverCollabEndpoint(service, { pubSub, ticketStore });
```

需要 Redis 6.2 及以上。Endpoint 不会释放外部传入的适配器和客户端，所以停止服务时先释放 Transport，再释放 pub/sub 适配器，最后关闭两个客户端。

## 运行示例

准备 Docker 和 Docker Compose，在仓库根目录执行：

```bash
docker compose -f examples/multi-node/compose.yaml up --build --force-recreate
```

也可以运行 `pnpm example:multi-node`，依赖安装和构建都在容器内完成。使用独立 Compose 的环境，将 `docker compose` 替换为 `docker-compose`。

打开 <http://127.0.0.1:3010/>：

1. 点击 **New Sheet** 创建文件，侧栏会显示它分配到的 `node-a` 或 `node-b`。
2. 把完整 URL 复制到另一个标签页，编辑同一份 Sheet，观察同步。
3. 再创建几份文件，选择分配到另一节点的文件重复验证。

`GATEWAY_PORT` 可修改默认端口 `3010`；`UNIVER_LICENSE` 可在构建时传入许可证。更新代码后重新执行启动命令，会同时重建服务节点和 Nginx，避免网关保留旧容器地址；随后重新打开页面。

## 关键配置

在 [`web/main.ts`](./web/main.ts) 中，为 WebSocket URL 追加 `unit` 参数：

```ts
const routingQuery = new URLSearchParams({ unit: unitID }).toString();
const connectionConfig = {
  collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
  wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
};
```

WebSocket 的路径本身不含 unitID，SDK 会保留应用追加的参数，供 Nginx 选节点。提交请求的路径已经包含 unitID。[`nginx.conf`](./nginx.conf) 提取同一个路由键，使用 `hash $routing_unit consistent` 分配请求：

| 请求 | 分配方式 | 原因 |
| --- | --- | --- |
| WebSocket | 按 query `unit` 一致性哈希 | 广播和确认留在提交所在的节点上直接推送 |
| 协同提交 `new_changes` | 按路径 `unitID` 一致性哈希 | 只有处理提交的节点需要把文档加载到内存 |
| ticket | 轮询 | 票据存在 Redis 中，任何节点都能消费 |
| snapshot、block、fetchmissing 读取 | 轮询 | 直接读数据库，不加载文档 |
| 页面、文件创建与列表、鉴权 | 轮询 | |

每个页面打开一份文档，切换文件时重新建连。`unit` 必须与当前文档 ID 一致，访问权限由应用校验。如果没有共享的票据存储，ticket 也必须和 WebSocket 落到同一节点。

Nginx 指令参考：[一致性哈希](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash)、[WebSocket 代理](https://nginx.org/en/docs/http/websocket.html)。

## 示例范围

- 两个容器共享同一宿主机上的 SQLite volume，数据在重启后保留。跨主机部署需要所有节点可访问、满足 SDK 数据库适配器契约的共享持久化存储。
- 两个节点共用一个 Redis 容器。生产环境应使用高可用的 Redis。Redis 不可用时，签票请求失败，WebSocket 建连返回可重试的 `503`。
- 如果网关会保持与上游的空闲连接，空闲超时要短于 Node 服务的 keep-alive 超时（默认 5 秒），否则会偶发 `502`。
- 节点拓扑固定，关闭自动换节点重试，不提供自动故障接管。
- 使用固定用户和演示权限，只覆盖 Sheet 协同。

## 日志与停止

```bash
# 查看节点日志
docker compose -f examples/multi-node/compose.yaml logs -f node-a node-b

# 停止服务，保留数据
docker compose -f examples/multi-node/compose.yaml down
```

需要清空演示数据时，在停止命令中加上 `--volumes`。
