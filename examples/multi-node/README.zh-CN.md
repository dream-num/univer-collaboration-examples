# 多节点部署

[English](./README.md) | 简体中文

在一个网关后面运行多个协同服务节点。SDK 通过两个接口把这些节点组成一个集群：**pub/sub 适配器**负责在节点之间转发实时消息，**会话票据存储**让任何节点都能接受其他节点签发的票据。`@univerjs-pro/collaboration-cluster-redis` 在 Redis 上实现了这两个接口。

本例用 Docker Compose 运行两个节点、Redis 和 Nginx，并提供简单的 Sheet 创建和文件列表，方便观察路由和验证多人协同。实际部署时可以换成任何网关或负载均衡；使用 Kubernetes 时由平台管理副本，网关按[按 unitID 路由以提升性能](#按-unitid-路由以提升性能)一节配置。

## 节点如何协作

| 职责 | 所在位置 | 说明 |
| --- | --- | --- |
| Unit、changeset、快照 | 共享数据库 | 唯一的事实来源。所有节点通过同一个数据库适配器提交；两个节点同时提交同一文档时，由数据库的 revision 校验决定先后。 |
| 广播、提交确认、成员名单、光标、会话失效 | pub/sub 适配器 | 每个节点发布自己连接上发生的事件，并投递其他节点发布的事件。投递是尽力而为的：广播丢失时，客户端发现 revision 不连续会主动拉取缺失的 changeset。 |
| 会话票据 | 会话票据存储 | 票据在一个节点签发、存入 Redis，可在任意节点消费一次。 |
| WebSocket 连接、已加载的文档 | 各节点自身 | 连接留在接受它的节点上；节点在提交时才把文档加载进内存。 |

配置了 `pubSub` 和 `ticketStore` 之后，任何请求都可以落在任何节点：节点扩缩容时已提交的数据、广播和票据都保持一致，正确性不依赖网关的路由方式。不配置时，房间和广播只覆盖单个进程。

## 配置每个节点

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

每个节点运行同样的代码，连接同一个 Redis（`REDIS_URL`）和同一个数据库。需要 Redis 6.2 及以上；也支持 `ioredis` 和 Redis Cluster，见 `@univerjs-pro/collaboration-cluster-redis` 的 README。

Endpoint 不会释放外部传入的适配器和客户端。停止服务时按创建的反序释放：先释放 Transport，再释放 pub/sub 适配器，最后关闭两个 Redis 连接。

## 运行示例

准备 Docker 和 Docker Compose，在仓库根目录执行：

```bash
docker compose -f examples/multi-node/compose.yaml up --build --force-recreate
```

也可以运行 `pnpm example:multi-node`，依赖安装和构建都在容器内完成。使用独立 Compose 的环境，将 `docker compose` 替换为 `docker-compose`。

打开 <http://127.0.0.1:3010/>：

1. 点击 **New Sheet** 创建文件，侧栏会显示哈希分配给它的节点，`node-a` 或 `node-b`。
2. 把完整 URL 复制到另一个标签页，编辑同一份 Sheet，观察同步。
3. 再创建几份文件，选择分配到另一节点的文件重复验证。

要观察跨节点投递，用 `docker compose -f examples/multi-node/compose.yaml logs -f node-a node-b` 跟踪日志：每次 `new_changes` 提交只会出现在一个节点的日志里，另一个节点通过 Redis 把它投递给自己的连接。

`GATEWAY_PORT` 可修改默认端口 `3010`；`UNIVER_LICENSE` 可在构建时传入许可证。更新代码后重新执行启动命令，会同时重建服务节点和 Nginx，避免网关保留旧容器地址；随后重新打开页面。

## 按 unitID 路由以提升性能

路由不是正确性的前提，但把同一文档的 WebSocket 和提交固定到一个节点是推荐的性能优化：

- 只有一个节点把文档加载进内存并保持热缓存，其他节点直接从数据库读取，不加载文档。
- 同一文档的提交在一个节点上串行执行，而不是多个节点在数据库的 revision 校验上互相竞争。
- 提交者的 WebSocket 和提交落在同一节点时，提交确认和广播都在本地直接推送，不经过 Redis 转发。

在 3 个节点、1800 份文档的压测中，全部轮询时服务端 p95 延迟约为哈希路由的 3 倍，节点内存多约 40%。额外把签票请求也哈希则没有可测量的差别，因为票据在任意节点都从 Redis 消费。

提交请求的路径已经包含 unitID。WebSocket 的路径不含，所以 [`web/main.ts`](./web/main.ts) 给它追加 `unit` 参数，SDK 会保留这个参数：

```ts
const routingQuery = new URLSearchParams({ unit: unitID }).toString();
const connectionConfig = {
  collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
  wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
};
```

[`nginx.conf`](./nginx.conf) 把两者映射成同一个路由键，用 `hash $routing_unit consistent` 分配：

| 请求 | 分配方式 | 效果 |
| --- | --- | --- |
| WebSocket | 按 query `unit` 一致性哈希 | 该文档的提交确认和广播在本地直接推送 |
| 协同提交 `new_changes` | 按路径 `unitID` 一致性哈希 | 只有一个节点加载并提交该文档 |
| ticket | 轮询 | 任意节点都从 Redis 消费票据 |
| snapshot、block、fetchmissing 读取 | 轮询 | 直接读数据库，不加载文档 |
| 页面、文件创建与列表、鉴权 | 轮询 | |

每个页面打开一份文档，切换文件时重新建连，所以 `unit` 始终与当前文档 ID 一致。访问权限由应用校验。Nginx 指令参考：[一致性哈希](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash)、[WebSocket 代理](https://nginx.org/en/docs/http/websocket.html)。

## 示例范围

- 两个容器共享同一宿主机上的 SQLite volume，数据在重启后保留。跨主机部署需要所有节点可访问、满足 SDK 数据库适配器契约的共享持久化存储。
- 两个节点共用一个 Redis 容器。生产环境应使用高可用的 Redis。Redis 不可用时，签票请求失败，WebSocket 建连返回可重试的 `503`。
- 跨节点投递是尽力而为的。广播丢失会在下一次 revision 不连续时补齐；提交确认丢失只会发生在提交者的 WebSocket 与提交不在同一节点时，此时提交者要等到下一个 revision 到达才能继续。按 unitID 路由让确认留在本地。
- 如果 Service 在多次 revision 冲突或可重试的数据库错误后放弃提交，会发送 `changeset_should_retry`；当前的协同客户端收到后不会重新提交，之后的修改只保留在本地，直到页面重新加载。按 unitID 路由把同一文档的提交集中在一个节点，实际不会触发这种情况。
- 如果网关会保持与上游的空闲连接，空闲超时要短于 Node 服务的 keep-alive 超时（默认 5 秒），否则会偶发 `502`。
- 节点拓扑固定：Nginx 不会把请求改发到另一个节点，示例也不提供自动故障接管。
- 使用固定用户和演示权限，只覆盖 Sheet 协同。

## 日志与停止

```bash
# 查看节点日志
docker compose -f examples/multi-node/compose.yaml logs -f node-a node-b

# 停止服务，保留数据
docker compose -f examples/multi-node/compose.yaml down
```

需要清空演示数据时，在停止命令中加上 `--volumes`。
