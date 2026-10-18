# Multi-node deployment

English | [简体中文](./README.zh-CN.md)

Run several collaboration server nodes behind one gateway. The SDK turns the nodes into one cluster through two interfaces: a **pub/sub adapter** that relays real-time messages between nodes, and a **session ticket store** that lets any node accept a ticket issued elsewhere. `@univerjs-pro/collaboration-cluster-redis` implements both on Redis.

This example runs two nodes, Redis, and Nginx with Docker Compose, plus a small Sheet creation and file list UI to observe routing and try collaborative editing. Replace Nginx with any gateway or load balancer in your deployment; on Kubernetes, let the platform manage replicas and configure the gateway as described in [Route by unitID for performance](#route-by-unitid-for-performance).

## How nodes work together

| Responsibility | Where it lives | Notes |
| --- | --- | --- |
| Units, changesets, snapshots | Shared database | The source of truth. Every node commits through the same database adapter; the database's revision check decides the order when two nodes commit the same document at once. |
| Broadcasts, submit acknowledgements, member lists, cursors, session invalidation | Pub/sub adapter | Each node publishes what happens to its own connections and delivers what other nodes publish. Delivery is best effort: a lost broadcast is recovered when the client sees a revision gap and fetches the missing changesets. |
| Session tickets | Session ticket store | A ticket is issued on one node, stored in Redis, and valid once on any node. |
| WebSocket connections, loaded documents | Each node | Connections stay on the node that accepted them. A node loads a document into memory when it commits to it. |

With `pubSub` and `ticketStore` configured, any request can land on any node: committed data, broadcasts, and tickets stay consistent when nodes are added or removed, and correctness does not depend on how the gateway routes. Without them, rooms and broadcasts cover only one process.

## Set up every node

Install the adapter package and a Redis client next to the Endpoint:

```bash
pnpm add @univerjs-pro/collaboration-endpoint @univerjs-pro/collaboration-cluster-redis redis
```

[`server/main.ts`](./server/main.ts) creates one Redis connection for commands and a duplicate for subscriptions, builds both adapters, and passes them to the Endpoint:

```ts
const redis = createClient({ url: redisURL });
const redisSubscriber = redis.duplicate();
await Promise.all([redis.connect(), redisSubscriber.connect()]);
const pubSub = new RedisPubSubAdapter({ pubClient: redis, subClient: redisSubscriber });
const ticketStore = new RedisSessionTicketStore({ client: redis });
const endpoint = new UniverCollabEndpoint(service, { pubSub, ticketStore });
```

Every node runs the same code against the same Redis (`REDIS_URL`) and the same database. Redis 6.2 or later is required; `ioredis` and Redis Cluster are also supported, see the `@univerjs-pro/collaboration-cluster-redis` README.

The Endpoint does not dispose the adapters or the clients it was given. Shut down in reverse order of creation: dispose the transport, then the pub/sub adapter, then close both Redis connections.

## Run the example

Install Docker with Docker Compose, then run from the repository root:

```bash
docker compose -f examples/multi-node/compose.yaml up --build --force-recreate
```

Alternatively, run `pnpm example:multi-node`. Dependencies and builds run inside the containers. If you use standalone Compose, replace `docker compose` with `docker-compose`.

Open <http://127.0.0.1:3010/>:

1. Click **New Sheet** to create a file. The sidebar shows the node that hashing assigns to it, `node-a` or `node-b`.
2. Copy the complete URL into another tab, edit the same Sheet, and check synchronization.
3. Create more files and repeat with one assigned to the other node.

To watch delivery cross nodes, follow the logs with `docker compose -f examples/multi-node/compose.yaml logs -f node-a node-b`. Each `new_changes` submission is logged by one node only; the other node delivers it to its own connections through Redis.

Set `GATEWAY_PORT` to change the default port of `3010`, or `UNIVER_LICENSE` to supply a license at build time. After code changes, rerun the startup command to recreate both the server nodes and Nginx, preventing stale container addresses in the gateway. Reopen the page afterward.

## Route by unitID for performance

Routing is not needed for correctness, but keeping a document's WebSockets and submissions on one node is the recommended optimization:

- Only one node loads the document into memory and keeps it warm; other nodes serve the document from the database without loading it.
- Commits for a document are serialized on one node instead of racing on the database revision check from several nodes.
- When the submitter's WebSocket is on the committing node, the acknowledgement and the broadcast are delivered locally instead of being relayed through Redis.

In a load test with 3 nodes and 1,800 documents, routing everything round robin raised server p95 latency to about 3 times the hashed configuration and node memory by about 40%. Hashing the ticket request in addition brought no measurable change, because tickets are redeemed from Redis on any node.

Submission paths already contain the unitID. The WebSocket path does not, so [`web/main.ts`](./web/main.ts) adds a `unit` query parameter that the SDK preserves:

```ts
const routingQuery = new URLSearchParams({ unit: unitID }).toString();
const connectionConfig = {
  collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
  wsSessionTicketUrl: `${baseURL}/user/session-ticket`,
};
```

[`nginx.conf`](./nginx.conf) maps both to one routing key and distributes with `hash $routing_unit consistent`:

| Request | Distribution | Effect |
| --- | --- | --- |
| WebSocket | Consistent hashing by query `unit` | Acknowledgements and broadcasts for the document are delivered locally |
| Collaboration submission (`new_changes`) | Consistent hashing by path `unitID` | One node loads and commits the document |
| Ticket | Round robin | Redeemed from Redis on any node |
| Snapshot, block, fetchmissing reads | Round robin | Served from the database without loading the document |
| Pages, file creation and listing, authorization | Round robin | |

Each page opens one document and reconnects when switching files, so the `unit` parameter always matches the current document ID. The application checks access permissions. Nginx references: [hash](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash) and [WebSocket proxying](https://nginx.org/en/docs/http/websocket.html).

## Scope

- Both containers share a SQLite volume on one host, preserving data across restarts. Deployments across hosts need shared persistence accessible to every node and satisfying the SDK database adapter contract.
- A single Redis container serves both nodes. Production deployments should use a highly available Redis. When Redis is unavailable, ticket requests fail and WebSocket connections are rejected with a retryable `503`.
- Cross-node delivery is best effort. A lost broadcast is recovered on the next revision gap. A lost acknowledgement, which can only happen when the submitter's WebSocket is on a different node than the commit, leaves the submitter waiting until the next revision arrives. Routing by unitID keeps acknowledgements local.
- If the Service gives up a commit after repeated revision conflicts or a retryable database error, it sends `changeset_should_retry`; the current collaboration client does not resubmit after that event, and its later edits stay local until the page reloads. Routing by unitID keeps a document's commits on one node, so this is not reached in practice.
- If your gateway keeps idle upstream connections open, set its idle timeout below the Node server's keep-alive timeout (5 seconds by default) to avoid occasional `502` responses.
- The node topology is fixed: Nginx does not retry a request on another node, and the example does not provide automatic failover.
- The example uses a fixed user and demo permissions and covers Sheet collaboration only.

## Logs and shutdown

```bash
# View node logs
docker compose -f examples/multi-node/compose.yaml logs -f node-a node-b

# Stop services and preserve data
docker compose -f examples/multi-node/compose.yaml down
```

Add `--volumes` to the stop command to erase the demo data.
