# Quick Start

最小可运行的 Sheet 实时协同示例。它使用固定用户、固定 Sheet 和 Memory Adapter，用于
快速确认 HTTP、WebSocket 和协同客户端链路能够正常工作。

```bash
pnpm example:quick-start
```

打开 <http://127.0.0.1:3010/?unit=quick-start-sheet&type=2>，再把完整 URL 复制到另一个浏览器。数据只保存在 Memory
Adapter 中，停止进程后丢失。

只需要阅读 `server/main.ts` 和 `web/main.ts`。固定 `demo-user` 和固定 allowed 只用于本地
教学。
