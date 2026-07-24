# Basic Sheets Worktree

一个完全本地运行的 Sheet Worktree demo：

- SQLite 保存固定 Trunk Sheet、Worktree draft 和应用层 Worktree Catalog。
- 浏览器继续使用现有 Univer Pro Collaboration Client。
- `@univerjs/collaboration-worktree-client` 只提供 scoped URL、管理 API 和状态事件。
- 左侧栏在主线、活动 Worktree 和已处理历史之间组织导航。
- 页面可以命名并创建 Worktree；Worktree 从固定 Trunk Sheet 建立基线。

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree build
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree start
```

打开 <http://127.0.0.1:3020>。页面默认显示只读主线。点击左侧 `Worktrees`
标题旁的 `+`，输入名称并创建分支；draft 状态下可以编辑表格，然后依次执行
`标记为待合入` 和 `合入主线`。合入或丢弃后的 Worktree 会进入左下角可展开的
`已处理` 列表，历史项只展示状态，不重新加载终态内容。

当前 Worktree 使用 `?worktree=<id>` 深链接；主线不使用查询参数。浏览器前进、
后退和刷新都可以恢复活动 Worktree。其他浏览器页面新创建的 Worktree 在刷新后
出现，本示例不额外实现 Catalog 级实时事件流。

## 应用层 Catalog

Worktree 是一等资源，应用路由使用顶级 `/api/worktrees`：

```text
GET  /api/worktrees?unitID=<optional-filter>
POST /api/worktrees
GET  /api/worktrees/:worktreeID
```

协同 Service 负责 Worktree 状态和生命周期；应用层 Catalog 负责名称、发现范围
和时间信息。示例继续使用固定 `demo-user` 并返回所有 Catalog 项，不定义可复用的
ACL。真实应用应在 Catalog 查询和各 Worktree lifecycle middleware 中接入自己的
权限模型。

清空本地数据：

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree reset
```
