# Examples

English | [简体中文](./README.zh-CN.md)

All examples use the same minimal `web/main.ts + server/main.ts` structure and can run independently. Start with [`quick-start`](./quick-start/README.md) to establish the main collaboration path, then choose another example for your current problem.

| Example | What it demonstrates |
| --- | --- |
| [`quick-start`](./quick-start/README.md) | Minimal real-time Sheet collaboration path |
| [`database-adapter`](./database-adapter/README.md) | SQLite persistence and restart recovery |
| [`permissions`](./permissions/README.md) | Trusted identity and server-side permission boundaries |
| [`history`](./history/README.md) | Version history service and browser entry |
| [`comments`](./comments/README.md) | Thread Comment service and frontend entry |
| [`worktree`](./worktree/README.md) | Complete draft, ready, reopen, and merge lifecycle |
| [`exchange`](./exchange/README.md) | Server-side Sheet import/export with `exchange-node` |

The examples cover only teaching and copyable assembly. They do not include file spaces, multi-type product editors, or a complete office suite. The exchange example intentionally uses an in-memory file/task store rather than a production file service.
