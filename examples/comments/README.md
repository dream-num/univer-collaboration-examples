# Comments

English | [简体中文](./README.zh-CN.md)

Adds server-side Thread Comment storage, the protocol Endpoint, and the frontend entry to a collaborative Sheet.

```bash
pnpm example:comments
```

Open <http://127.0.0.1:3010/?unit=comments-sheet&type=2>, select a cell, and use the comment entry. `server/main.ts` shows the independent Comment Service Adapter and how the Comment Endpoint reuses the main collaboration Endpoint's Session and Unit room through `roomHost`.

Comment anchors still change with Sheet collaboration data, while comment content and solved state are stored by the Comment Service. Both must be included in the product data lifecycle.
