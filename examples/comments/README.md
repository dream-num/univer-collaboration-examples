# Comments

English | [简体中文](./README.zh-CN.md)

Adds server-side Thread Comment storage, the protocol Endpoint, and the frontend entry to a collaborative Sheet.

```bash
pnpm example:comments
```

Open <http://127.0.0.1:3010/?unit=comments-sheet>, select a cell, and use the comment entry.
`server/main.ts` shows the independent Comment Service Adapter and how the Comment Endpoint reuses
the main collaboration Endpoint's Session and Unit room through `roomHost`.

Comment anchors still change with Sheet collaboration data, while comment content and solved state
are stored by the Comment Service. Both must be included in the product data lifecycle. The core and
Comment SQLite Adapters share `.data/collaboration.sqlite`, so both kinds of data survive server
restarts.

Inserted images are embedded in the Sheet as base64 because this example has no file service; see
the [`file-service`](../file-service/README.md) example for a file service.

## Packages

The Comment Adapters are open source under Apache-2.0 in [univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community)
and are published to npm under the same names and versions as the rest of the SDK. Use them as they
are, or take the source as the reference for your own.

| Package | Description |
| --- | --- |
| [`@univerjs-pro/collaboration-comment-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-comment-database-sqlite/README.md) | SQLite Adapter on `libsql`. Used here. |
| [`@univerjs-pro/collaboration-comment-database-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-comment-database-memory/README.md) | In-process Adapter for tests and temporary services. |
