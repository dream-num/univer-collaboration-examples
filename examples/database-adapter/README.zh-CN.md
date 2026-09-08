# Database Adapter

[English](./README.md) | 简体中文

在 Quick Start 的基础上把 Memory Adapter 换成 SQLite，展示协同数据如何在服务重启后
继续保留。

```bash
pnpm example:database-adapter
```

打开 <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>。数据写入 `.data/collaboration.sqlite`，再次启动仍会读取同一个
Unit。需要清空演示数据时运行 `pnpm --filter @univerjs/collaboration-example-database-adapter reset`。

默认入口是 [`server/main.ts`](./server/main.ts)：使用 SDK 内置的 `SQLiteDatabaseAdapter`，
并在 Unit 不存在时创建一次。

## 自定义数据库

自定义实现示例放在 [`server/custom-database-adapter`](./server/custom-database-adapter/)：
目前提供 [Memory Adapter](./server/custom-database-adapter/custom-memory-database-adapter.ts)，直接实现 `IDatabaseAdapter`。

默认仍使用内置 SQLite。试用 Memory 时，在 [`server/main.ts`](./server/main.ts) 中取消对应 import 和 `new` 的注释，并注释默认 Adapter 的创建语句。内存数据在进程退出后丢失。
