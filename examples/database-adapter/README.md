# Database Adapter

在 Quick Start 的基础上把 Memory Adapter 换成 SQLite，展示协同数据如何在服务重启后
继续保留。

```bash
pnpm example:database-adapter
```

打开 <http://127.0.0.1:3010/?unit=persistent-sheet&type=2>。数据写入 `.data/collaboration.sqlite`，再次启动仍会读取同一个
Unit。需要清空演示数据时运行 `pnpm --filter @univerjs/collaboration-example-database-adapter reset`。

只需要对照 Quick Start 阅读 `server/main.ts`：主要变化就是把 Memory Adapter 换成 SQLite，
并在 Unit 不存在时创建一次。
