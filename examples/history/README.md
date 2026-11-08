# History

English | [简体中文](./README.zh-CN.md)

Adds the History Service, History Endpoint, and browser history entry alongside the basic collaboration path.

```bash
pnpm example:history
```

Open <http://127.0.0.1:3010/?unit=history-sheet>, edit the Sheet, and click `History` at the top of
the page to view versions. History builds on the basic collaboration path: `server/main.ts` assembles
core first, passes it to the History Service through `collabService`, and registers authentication,
the Collaboration Endpoint, and the History Endpoint in that order.

The History index and core data use different Adapters that share `.data/collaboration.sqlite` in
this example. Both survive restarts and must be included in production persistence and backup
policies.

## Packages

The History Adapters are open source under Apache-2.0 in [univer-collaboration-sdk-community](https://github.com/dream-num/univer-collaboration-sdk-community)
and are published to npm under the same names and versions as the rest of the SDK. Use them as they
are, or take the source as the reference for your own.

| Package | Description |
| --- | --- |
| [`@univerjs-pro/collaboration-history-database-sqlite`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-history-database-sqlite/README.md) | SQLite Adapter on `libsql`. Used here. |
| [`@univerjs-pro/collaboration-history-database-memory`](https://github.com/dream-num/univer-collaboration-sdk-community/blob/main/packages/collaboration-history-database-memory/README.md) | In-process Adapter for tests and temporary services. |
