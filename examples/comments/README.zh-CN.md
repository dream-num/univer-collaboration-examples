# Comments

[English](./README.md) | 简体中文

在基础协同 Sheet 上增加 Thread Comment 的服务端存储、协议 Endpoint 和前端入口。

```bash
pnpm example:comments
```

打开 <http://127.0.0.1:3010/?unit=comments-sheet>，选择单元格并使用评论入口。`server/main.ts` 展示了
Comment Service 的独立 Adapter，以及 Comment Endpoint 如何通过 `roomHost` 复用主协同 Endpoint 的 Session 和
Unit room。

评论 anchor 仍随 Sheet 协同数据变化，评论正文和 solved 状态由 Comment Service 保存；两者必须一起纳入业务数据
生命周期。core 与 Comment SQLite Adapter 共享 `.data/collaboration.sqlite`，两类数据都会在服务重启后保留。

示例没有文件服务，插入的图片以 base64 内嵌在 Sheet 中；文件服务见 [`file-service`](../file-service/README.zh-CN.md)
示例。

## 相关的包

Comment 的 Adapter 在 [univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community) 以 Apache-2.0 开源，发布到 npm 时与 SDK 其余
部分使用相同的包名和版本号。可以直接使用，也可以参考源码实现自己的。

| 包 | 说明 |
| --- | --- |
| [`@univerjs-pro/collaboration-comment-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-comment-database-sqlite/README.zh-CN.md) | 基于 `libsql` 的 SQLite Adapter。本示例使用。 |
| [`@univerjs-pro/collaboration-comment-database-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-comment-database-memory/README.zh-CN.md) | 进程内 Adapter，用于测试和临时服务。 |
