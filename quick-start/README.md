# Quick Start

用最少代码跑通一个 Univer Sheet 的实时协同。这个示例只有一个固定用户、一个固定 Unit，
数据保存在内存中。

## 运行

在仓库根目录执行：

```bash
pnpm install
pnpm example:quick-start
```

打开 <http://127.0.0.1:3010>，再把完整 URL 复制到另一个浏览器或无痕窗口。在任意窗口编辑，
另一个窗口会实时同步内容、成员和光标。

需要显式 Univer Pro license 时，在构建前设置：

```bash
VITE_UNIVER_LICENSE='your-license' \
  pnpm --filter @univerjs/collaboration-example-quick-start build
```

## 只需要阅读两个文件

- [`server.ts`](./server.ts)：Memory Adapter、Service、Endpoint、Transport 和两个固定响应。
- [`client.ts`](./client.ts)：Sheets Core 与 Collaboration Client 配置。

服务端主链路是：

```text
Node HTTP/WebSocket
→ Transport
→ UniverCollabEndpoint
→ UniverCollabService
→ MemoryDatabaseAdapter
```

`demo-user`、所有授权结果和 `quick-start-sheet` 都是 hardcode。进程停止后数据会丢失；
示例直接信任官方客户端的请求结构，不演示输入校验和优雅停机。它只用于第一次跑通协同，
不能作为生产认证、持久化或安全方案。

下一步需要持久化、History 和 Comment 时看
[Basic Sheets](../basic-sheets/README.md)；需要真实登录与 ACL 时看
[Basic Sheets Auth](../basic-sheets-auth/README.md)。
