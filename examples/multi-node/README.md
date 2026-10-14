# Multi-node deployment

English | [简体中文](./README.zh-CN.md)

Deploying multiple nodes distributes collaboration workloads for different documents across servers, reducing the load on each node and increasing overall capacity for concurrent collaboration.

This example uses Nginx to route requests to two collaboration server nodes and provides a simple Sheet creation and file list UI to observe routing and try collaborative editing. For your deployment, you can choose another gateway or load balancer to fit your existing infrastructure. When using a container orchestration platform such as Kubernetes, let the platform manage service replicas and configure the gateway to route requests using consistent hashing by unitID.

## Why route by document?

Every node passes a shared pub/sub adapter and a shared session ticket store to its Endpoint. Collaboration results are then correct wherever a request lands, including when nodes are added or removed.

We still recommend consistent hashing by **unitID (document ID)** for performance. When a document's WebSockets and submissions reach the same node, broadcasts and submit acknowledgements are delivered locally. When they reach different nodes, both are relayed through Redis, adding a round trip and memory on every node that loads the document.

## Cross-node delivery

[`server/main.ts`](./server/main.ts) creates the Redis-backed adapters from `@univerjs-pro/collaboration-cluster-redis` and passes them to the Endpoint:

```ts
const redis = createClient({ url: redisURL });
const redisSubscriber = redis.duplicate();
await Promise.all([redis.connect(), redisSubscriber.connect()]);
const pubSub = new RedisPubSubAdapter({ pubClient: redis, subClient: redisSubscriber });
const ticketStore = new RedisSessionTicketStore({ client: redis });
const endpoint = new UniverCollabEndpoint(service, { pubSub, ticketStore });
```

Redis 6.2 or later is required. The Endpoint does not dispose the adapter or the clients, so shutdown disposes the transport first, then the pub/sub adapter, then both clients.

## Run the example

Install Docker with Docker Compose, then run from the repository root:

```bash
docker compose -f examples/multi-node/compose.yaml up --build --force-recreate
```

Alternatively, run `pnpm example:multi-node`. Dependencies and builds run inside the containers. If you use standalone Compose, replace `docker compose` with `docker-compose`.

Open <http://127.0.0.1:3010/>:

1. Click **New Sheet** to create a file. The sidebar shows its assigned `node-a` or `node-b`.
2. Copy the complete URL into another tab, edit the same Sheet, and check synchronization.
3. Create more files and repeat with one assigned to the other node.

Set `GATEWAY_PORT` to change the default port of `3010`, or `UNIVER_LICENSE` to supply a license at build time. After code changes, rerun the startup command to recreate both the server nodes and Nginx, preventing stale container addresses in the gateway. Reopen the page afterward.

## Essential configuration

In [`web/main.ts`](./web/main.ts), add a `unit` parameter to the WebSocket URL:

```ts
const routingQuery = new URLSearchParams({ unit: unitID }).toString();
const connectionConfig = {
  collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
  wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
};
```

The WebSocket path does not contain a unitID. The SDK preserves the parameter added by the application so Nginx can select a node. Submission paths already contain the unitID. [`nginx.conf`](./nginx.conf) extracts a common routing key and uses `hash $routing_unit consistent`:

| Request | Distribution | Why |
| --- | --- | --- |
| WebSocket | Consistent hashing by query `unit` | Broadcasts and acknowledgements stay on the node that commits |
| Collaboration submission (`new_changes`) | Consistent hashing by path `unitID` | Only the submitting node loads the document into memory |
| Ticket | Round robin | Tickets live in Redis and can be redeemed on any node |
| Snapshot, block, fetchmissing reads | Round robin | Reads come from the database without loading the document |
| Pages, file creation and listing, authorization | Round robin | |

Each page opens one document and reconnects when switching files. The `unit` parameter must match the current document ID. The application checks access permissions. Without a shared ticket store, tickets would also need to reach the WebSocket's node.

Nginx references: [hash](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash) and [WebSocket proxying](https://nginx.org/en/docs/http/websocket.html).

## Scope

- Both containers share a SQLite volume on one host, preserving data across restarts. Deployments across hosts need shared persistence accessible to every node and satisfying the SDK database adapter contract.
- A single Redis container serves both nodes. Production deployments should use a highly available Redis. When Redis is unavailable, ticket requests fail and WebSocket connections are rejected with a retryable `503`.
- If your gateway keeps idle upstream connections open, set its idle timeout below the Node server's keep-alive timeout (5 seconds by default) to avoid occasional `502` responses.
- The node topology is fixed, automatic retries on another node are disabled, and the example does not provide automatic failover.
- The example uses a fixed user and demo permissions and covers Sheet collaboration only.

## Logs and shutdown

```bash
# View node logs
docker compose -f examples/multi-node/compose.yaml logs -f node-a node-b

# Stop services and preserve data
docker compose -f examples/multi-node/compose.yaml down
```

Add `--volumes` to the stop command to erase the demo data.
