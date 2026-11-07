# History

[English](./README.md) | 简体中文

在基础协同链路之外增加 History Service、History Endpoint 和浏览器历史入口。

```bash
pnpm example:history
```

打开 <http://127.0.0.1:3010/?unit=history-sheet>，编辑后点击页面上方的 `History` 查看版本。History 建立在
基础协同链路之上：`server/main.ts` 先组装 core，再把 `collabService` 传给 History Service，并按认证、
Collaboration Endpoint、History Endpoint 的顺序注册。

History 索引与 core 数据使用不同 Adapter，本示例让它们共享 `.data/collaboration.sqlite`。两者都会在重启后
保留，生产环境也需要分别纳入持久化和备份策略。

## 相关的包

History 的 Adapter 在 [univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community) 以 Apache-2.0 开源，发布到 npm 时与 SDK 其余
部分使用相同的包名和版本号。可以直接使用，也可以参考源码实现自己的。

| 包 | 说明 |
| --- | --- |
| [`@univerjs-pro/collaboration-history-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-history-database-sqlite/README.zh-CN.md) | 基于 `libsql` 的 SQLite Adapter。本示例使用。 |
| [`@univerjs-pro/collaboration-history-database-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-history-database-memory/README.zh-CN.md) | 进程内 Adapter，用于测试和临时服务。 |
