# Basic Sheets Worktree

一个完全本地运行的 Sheet Worktree demo：

- SQLite 保存固定 Trunk Sheet、Worktree draft 和应用层 Worktree Catalog。
- 使用 grid Ribbon 和与 Basic Sheets 一致的高级 Sheet 数据/UI 插件；Worktree
  viewer 不创建 Worker。
- 浏览器继续使用现有 Univer Pro Collaboration Client。
- `@univerjs-pro/collaboration-worktree-client` 只提供 Worktree 专用 URL、管理 API 和状态事件。
- 左侧栏在主线、活动 Worktree 和已处理历史之间组织导航。
- 页面可以命名并创建 Worktree；Worktree 从固定 Trunk Sheet 建立基线。
- ready Unit 落后主线时默认显示静态合入预览，并可切换回 Worktree 版本。

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree build
pnpm --filter @univerjs/collaboration-example-basic-sheets-worktree start
```

打开 <http://127.0.0.1:3020>。页面默认显示只读主线。点击左侧 `Worktrees`
标题旁的 `+`，输入名称并创建分支；draft 状态下可以编辑表格，然后依次执行
`标记为待合入` 和 `合入主线`。合入或丢弃后的 Worktree 会进入左下角可展开的
`已处理` 列表，历史项只展示状态，不重新加载终态内容。

进入 `ready` 后，页面按当前 Unit 查询合入预览。若主线在 Worktree 创建后继续
前进，顶部显示 `合入预览 / Worktree 版本`，并默认选择合入预览；OT 冲突会显示
空状态，但不会禁用正式合入。预览请求失败时回退到 Worktree 版本并可重试。
预览是当前页面的一次性缓存，不建立协同连接，也不保证与主线再次变化后的正式
合入完全相同。

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
