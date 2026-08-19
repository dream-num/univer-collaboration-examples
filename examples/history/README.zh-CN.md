# History

[English](./README.md) | 简体中文

在基础协同链路之外增加 History Service、History Endpoint 和浏览器历史入口。

```bash
pnpm example:history
```

打开 <http://127.0.0.1:3010/?unit=history-sheet&type=2>，编辑后点击页面上方的 `History` 查看版本。这个示例刻意把
History 作为可选派生能力：`server/main.ts` 先组装 core，再 attach History，并按
认证 → History Endpoint → Collaboration Endpoint 的顺序注册。

History 索引与 core 数据使用不同 Adapter；生产环境需要分别纳入持久化和备份策略。
