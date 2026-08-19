# Quick Start

English | [简体中文](./README.zh-CN.md)

The smallest runnable real-time Sheet collaboration example. It uses a fixed user, a fixed Sheet, and the Memory Adapter to quickly verify that HTTP, WebSocket, and the collaboration client path work correctly.

```bash
pnpm example:quick-start
```

Open <http://127.0.0.1:3010/?unit=quick-start-sheet&type=2>, then copy the complete URL into another browser. Data is stored only in the Memory Adapter and is lost when the process stops.

Read only `server/main.ts` and `web/main.ts`. The fixed `demo-user` and fixed allowed responses are for local teaching only.
