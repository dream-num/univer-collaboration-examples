# Multi-node deployment

English | [简体中文](./README.zh-CN.md)

Deploying multiple nodes distributes collaboration workloads for different documents across servers, reducing the load on each node and increasing overall capacity for concurrent collaboration.

This example uses Nginx to route requests to two collaboration server nodes and provides a simple Sheet creation and file list UI to observe routing and try collaborative editing. For your deployment, you can choose another gateway or load balancer to fit your existing infrastructure. When using a container orchestration platform such as Kubernetes, let the platform manage service replicas and configure the gateway to route requests using consistent hashing by unitID.

## Why route by document?

We recommend consistent hashing by **unitID (document ID)** to keep collaboration requests for each document on the same node while distributing different documents across nodes. This reduces the need for coordination between nodes and can improve collaboration performance.

This example routes tickets, WebSockets, and collaboration submissions by unitID. Reads, including snapshots and history, use round robin across nodes.

## Current limitations and planned support

Sessions and real-time broadcasts currently operate within a single server process, so tickets, WebSockets, and collaboration submissions for a document must reach the same node. If scaling or failover sends requests to different nodes, the Service and a database adapter that satisfies its contract still ensure consistency of committed collaboration data, but real-time broadcasts may be incomplete.

A cross-node broadcast component is in development to support real-time message delivery between nodes. Even after this support becomes available, we will continue to recommend routing by unitID to reduce coordination overhead between nodes.

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

In [`web/main.ts`](./web/main.ts), add the same `unit` parameter to the ticket and WebSocket URLs:

```ts
const routingQuery = new URLSearchParams({ unit: unitID }).toString();
const connectionConfig = {
  collabWebSocketUrl: `${wsProtocol}://${location.host}/universer-api/comb/connect?${routingQuery}`,
  wsSessionTicketUrl: `${baseURL}/user/session-ticket?${routingQuery}`,
};
```

These two protocol paths do not contain a unitID. The SDK preserves the parameter added by the application so Nginx can select a node. Submission paths already contain the unitID. [`nginx.conf`](./nginx.conf) extracts a common routing key and uses `hash $routing_unit consistent`:

| Request | Distribution |
| --- | --- |
| Ticket, WebSocket | Consistent hashing by query `unit` |
| Collaboration submission (`new_changes`) | Consistent hashing by path `unitID` |
| Snapshot, block, fetchmissing reads | Round robin |
| Pages, file creation and listing, authorization | Round robin |

Each page opens one document and reconnects when switching files. The `unit` parameter must match the current document ID. The application checks access permissions.

Nginx references: [hash](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#hash) and [WebSocket proxying](https://nginx.org/en/docs/http/websocket.html).

## Scope

- Both containers share a SQLite volume on one host, preserving data across restarts. Deployments across hosts need shared persistence accessible to every node and satisfying the SDK database adapter contract.
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
