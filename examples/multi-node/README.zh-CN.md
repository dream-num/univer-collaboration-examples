# 多节点部署

[English](./README.md) | 简体中文

多节点部署可以将不同文档的协同负载分配到多个服务节点，分担单节点压力，提升整体并发处理能力。

本例使用 Nginx 将请求路由到两个协同服务节点，并提供简单的 Sheet 创建和文件列表，方便观察路由和验证多人协同。实际部署时，可以根据现有基础设施选择其他网关或负载均衡方案；使用 Kubernetes 等容器编排平台时，可由平台管理服务副本，并配置相应网关按 unitID 做一致性路由。

## 为什么需要按文档路由？

推荐按 **unitID（文档 ID）** 做一致性哈希，让同一文档的协同请求集中到同一个节点，不同文档的负载则分散到多个节点。这可以减少跨节点协调的需求，有助于获得更好的协同性能。

本例对 ticket、WebSocket 和协同提交按 unitID 路由；快照和历史等读取请求由各节点轮询处理。

## 当前限制与开发计划

当前版本的会话和实时广播局限于单个服务进程，因此同一文档的 ticket、WebSocket 和协同提交需要命中同一节点。扩缩容或故障切换导致请求分散到不同节点时，Service 与满足契约的数据库适配器仍保证已提交协同数据的一致性，但实时广播可能不完整。

跨节点广播组件正在开发中，用于补齐跨节点实时消息投递能力。即使后续版本支持跨节点广播，仍推荐按 unitID 做一致性路由，减少跨节点协调开销。

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

在 [`web/main.ts`](./web/main.ts) 中，为 ticket 和 WebSocket URL 追加相同的 `unit` 参数：

```ts
const routingQuery = new URLSearchParams({ unit: unitID }).toString();
const connectionConfig = {
  collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
  wsSessionTicketUrl: `${baseURL}/user/session-ticket?${routingQuery}`,
};
```

这两个协议路径本身不含 unitID，SDK 会保留应用追加的参数，供 Nginx 选节点。提交请求的路径已经包含 unitID。[`nginx.conf`](./nginx.conf) 提取同一个路由键，使用 `hash $routing_unit consistent` 分配请求：

| 请求 | 分配方式 |
| --- | --- |
| ticket、WebSocket | 按 query `unit` 一致性哈希 |
| 协同提交 `new_changes` | 按路径 `unitID` 一致性哈希 |
| snapshot、block、fetchmissing 读取 | 轮询 |
| 页面、文件创建与列表、鉴权 | 轮询 |

每个页面打开一份文档，切换文件时重新建连。`unit` 必须与当前文档 ID 一致，访问权限由应用校验。

Nginx 指令参考：[一致性哈希](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash)、[WebSocket 代理](https://nginx.org/en/docs/http/websocket.html)。

## 示例范围

- 两个容器共享同一宿主机上的 SQLite volume，数据在重启后保留。跨主机部署需要所有节点可访问、满足 SDK 数据库适配器契约的共享持久化存储。
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
