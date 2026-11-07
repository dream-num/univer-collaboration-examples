# Database Adapter

[English](./README.md) | 简体中文

Database Adapter 负责保存文档（Unit）、快照、Sheet blocks 和 changesets。本例默认使用 SDK 内置的
`SQLiteDatabaseAdapter`，并说明如何更换存储和实现自己的 Adapter。

## 运行示例

准备 Node.js 24 或更高版本和 pnpm，在仓库根目录执行：

```bash
pnpm install
pnpm example:database-adapter
```

打开 <http://127.0.0.1:3010/?unit=persistent-sheet>：

1. 在两个标签页打开同一地址，编辑单元格，确认修改已同步。
2. 在终端按 `Ctrl+C` 停止服务，再运行同一启动命令。
3. 刷新页面，确认重启前的内容仍然存在。

数据保存在 `examples/database-adapter/.data/collaboration.sqlite`。首次启动会创建 `persistent-sheet`；后续启动
从已保存的快照和 changesets 恢复文档。

## 接入方式

在 [`server/main.ts`](./server/main.ts) 中，将 Adapter 注入 `UniverCollabService`：

```ts
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";

const database = new SQLiteDatabaseAdapter({ filename: ".data/collaboration.sqlite" });
const service = new UniverCollabService({ dbAdapter: database });
```

创建 Adapter 前需确保父目录存在，完整入口已包含目录创建逻辑。Adapter 由应用管理；关闭时应先停止使用它的
Service，再调用 `database.dispose()`。

## 更换存储

替换 `dbAdapter` 即可。多个节点共用一个数据库时用 PostgreSQL Adapter。连接池由应用管理；`create` 会初始化空的
`collaboration` schema，已有 schema 则只做校验：

```ts
import { PostgresDatabaseAdapter } from "@univerjs-pro/collaboration-database-postgres";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const database = await PostgresDatabaseAdapter.create({ pool });
```

[`multi-node`](../multi-node/README.zh-CN.md) 示例用它运行两个节点。

## 实现自己的 Adapter

实现 `IDatabaseAdapter` 并作为 `dbAdapter` 传入。Service 不会为 Adapter 补上事务、CAS 或去重，这些要由
Adapter 在自己的数据库上实现。Memory Adapter 是这份契约最短的完整实现，SQLite 和 PostgreSQL Adapter 展示同一
契约如何落到数据库事务。

### commitChangeset

`commitChangeset` 是并发提交的关键：通过 revision CAS（比较并交换），只有数据库中的当前 head 等于
`changeset.revision - 1` 时，才能写入 changeset，并将 head 更新为 `changeset.revision`。检查、写入和更新必须在
数据库中原子完成，任一步骤失败都不能留下部分写入。

提交成功返回 `committed`；head 不匹配时不写入数据，返回 `revision-mismatch` 和 `actualHeadRevision`，由 Service
重新读取历史、处理并发变更后重试。SQLite Adapter 在一个写事务内完成这一过程，PostgreSQL Adapter 用 `FOR UPDATE`
锁住 Unit 行。

OT 和提交去重由 Service 处理，鉴权由 middleware 处理，实时广播由 Endpoint 处理。

## 清空数据

先停止服务，再从仓库根目录执行：

```bash
pnpm --filter @univerjs/collaboration-example-database-adapter reset
```

此命令删除本示例的 SQLite 数据库文件。下次启动会重新创建空白文档。

## 相关的包

三个 Adapter 都在 [univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community) 以 Apache-2.0 开源，发布到 npm 时与 SDK 其余部分
使用相同的包名和版本号。可以直接使用，也可以参考源码实现自己的。

| 包 | 说明 |
| --- | --- |
| [`@univerjs-pro/collaboration-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-database-sqlite/README.zh-CN.md) | 基于 `libsql` 的 SQLite Adapter，单节点。本示例使用。 |
| [`@univerjs-pro/collaboration-database-postgres`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-database-postgres/README.zh-CN.md) | 基于 `node-postgres` 的 PostgreSQL Adapter，单节点或多节点。 |
| [`@univerjs-pro/collaboration-database-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-database-memory/README.zh-CN.md) | 进程内 Adapter，用于测试和临时服务。 |
