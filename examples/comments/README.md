# Comments

在基础协同 Sheet 上增加 Thread Comment 的服务端存储、协议 Endpoint 和前端入口。

```bash
pnpm example:comments
```

打开 <http://127.0.0.1:3010/?unit=comments-sheet&type=2>，选择单元格并使用评论入口。`server/main.ts` 展示了
Comment Service 的独立 Adapter，以及 Comment Endpoint 如何通过 `roomHost` 复用主协同
Endpoint 的 Session 和 Unit room。

评论 anchor 仍随 Sheet 协同数据变化，评论正文和 solved 状态由 Comment Service 保存；两者
必须一起纳入业务数据生命周期。
