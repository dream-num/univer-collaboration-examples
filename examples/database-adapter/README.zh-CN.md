# Database Adapter

[English](./README.md) | 简体中文

使用 SQLite 持久化协同数据，服务重启后可继续读取同一个 Unit。

```bash
pnpm example:database-adapter
```

打开 <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>。数据写入 `.data/collaboration.sqlite`，再次启动仍会读取同一个
Unit。需要清空数据时，先停止服务，再运行 `pnpm --filter @univerjs/collaboration-example-database-adapter reset`。

默认入口是 [`server/main.ts`](./server/main.ts)：使用 SDK 内置的 `SQLiteDatabaseAdapter`，
并在 Unit 不存在时创建一次。

自定义 Adapter 示例：

- [Memory](./server/custom-database-adapter/custom-memory-database-adapter.ts)
- [SQLite](./server/custom-database-adapter/custom-sqlite-database-adapter.ts)

两个自定义 Adapter 均实现 RC 契约：`getSnapshotInfo` 只读取快照元信息；
`getChangesets` 返回数组，Unit 非 active 时返回 `null`；省略 revision 上界表示不限制。
显式传入 `0` 是普通上界，不再表示当前 head。
