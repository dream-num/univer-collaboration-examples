# Basic Sheets Worktree

一个完全本地运行的 Sheet Worktree demo：

- SQLite 保存 trunk Unit 和 Worktree draft。
- 浏览器继续使用现有 Univer Pro Collaboration Client。
- `@univerjs/collaboration-worktree-client` 只切换 scoped URL。
- 顶部工具栏展示完整 Worktree 状态，并提供 ready、reopen、merge、discard。
- 首次打开自动创建一个 Worktree 和一个 Worktree-local Sheet。

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree build
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree start
```

打开 <http://127.0.0.1:3020>。页面会重定向到带 `worktree`、`unit` 和 `type`
参数的 URL。编辑 Sheet 后点击 `Mark ready`，再点击 `Merge`，顶部会显示该
Unit 已合入 trunk revision 1。

清空本地数据：

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree reset
```
