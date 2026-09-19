# Database Adapter

[English](./README.md) | 简体中文

Database Adapter 负责保存文档（Unit）、快照、Sheet blocks 和 changesets。本例默认使用 SDK 内置的 `SQLiteDatabaseAdapter`，并提供两个自定义实现，帮助你了解 `IDatabaseAdapter` 接口，并参考其实现接入自己的存储。

## 运行示例

准备 Node.js 24 或更高版本和 pnpm，在仓库根目录执行：

```bash
pnpm install
pnpm example:database-adapter
```

打开 <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>：

1. 在两个标签页打开同一地址，编辑单元格，确认修改已同步。
2. 在终端按 `Ctrl+C` 停止服务，再运行同一启动命令。
3. 刷新页面，确认重启前的内容仍然存在。

数据保存在 `examples/database-adapter/.data/collaboration.sqlite`。首次启动会创建 `persistent-sheet`；后续启动从已保存的快照和 changesets 恢复文档。

## 接入方式

在 [`server/main.ts`](./server/main.ts) 中，将 Adapter 注入 `UniverCollabService`：

```ts
import { SQLiteDatabaseAdapter } from "@univerjs-pro/collaboration-database-sqlite";
import { UniverCollabService } from "@univerjs-pro/collaboration-service";

const database = new SQLiteDatabaseAdapter({ filename: ".data/collaboration.sqlite" });
const service = new UniverCollabService({ dbAdapter: database });
```

创建 Adapter 前需确保父目录存在，完整入口已包含目录创建逻辑。更换存储只需替换 `dbAdapter`。Adapter 由应用管理；关闭时应先停止使用它的 Service，再调用 `database.dispose()`。

## 自定义 Adapter

两个示例都实现 `IDatabaseAdapter`，可以从 Memory 版本理解接口，再看 SQLite 版本如何落到数据库事务：

| 实现 | 重点 |
| --- | --- |
| [CustomMemoryDatabaseAdapter](./server/custom-database-adapter/custom-memory-database-adapter.ts) | 使用 Map 保存数据，展示读取、revision 检查和删除恢复；退出进程后数据丢失 |
| [CustomSQLiteDatabaseAdapter](./server/custom-database-adapter/custom-sqlite-database-adapter.ts) | 使用 `libsql` 和 MessagePack，展示表结构、事务和协议对象存储；数据在重启后保留 |

试用时，在 `server/main.ts` 中取消对应 import 和构造语句的注释，并注释掉当前构造语句，然后重新运行启动命令。自定义 SQLite 使用 `.data/custom-collaboration.sqlite`，其表结构与内置 Adapter 不同，必须使用独立文件。

### commitChangeset

`commitChangeset` 是并发提交的关键：通过 revision CAS（比较并交换），只有数据库中的当前 head 等于 `changeset.revision - 1` 时，才能写入 changeset，并将 head 更新为 `changeset.revision`。检查、写入和更新必须在数据库中原子完成，任一步骤失败都不能留下部分写入。

提交成功返回 `committed`；head 不匹配时不写入数据，返回 `revision-mismatch` 和 `actualHeadRevision`，由 Service 重新读取历史、处理并发变更后重试。自定义 SQLite 示例通过 `BEGIN IMMEDIATE` 事务实现这一过程。

OT 和提交去重由 Service 处理，鉴权由 middleware 处理，实时广播由 Endpoint 处理。

## 清空数据

先停止服务，再从仓库根目录执行：

```bash
pnpm --filter @univerjs/collaboration-example-database-adapter reset
```

此命令删除本例内置和自定义 SQLite 的两个数据库文件；下次启动会重新创建空白文档。
