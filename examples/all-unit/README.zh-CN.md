# All Unit

[English](./README.md) | 简体中文

其他示例各讲一项能力，`all-unit` 把它们装配到同一个应用里，方便看清它们如何配合：六种 Unit、文件存储、
服务端导入导出、嵌入的 Office 附件、评论和编辑历史。

```bash
pnpm install
pnpm example:all-unit
```

打开 <http://127.0.0.1:3010>，在侧边栏切换 Unit。

| 能力 | 支持范围 | 怎么试 |
| --- | --- | --- |
| 实时协同 | Sheet、Doc、Slide、Board、Base、PDF | 在另一个浏览器打开同一个 Unit |
| 图片和附件 | 支持插入的编辑器 | 插入图片，文件通过 File Endpoint 上传 |
| 导入导出 | Sheet、Doc、Slide、Base、PDF | 功能区 Start 标签页的 **File** 菜单：**Open(File)** 和 **Save As**；Base 在表格工具栏右侧的 **File**。导入完成后右下角出现通知，点击其中的链接打开新 Unit |
| 嵌入的 Office 附件 | Sheet、Doc | 导入带 Word 或 Excel 嵌入对象的文件，选中后可以预览、下载或转为在线 Unit |
| 评论 | Sheet、Doc、Slide、Base、Board | Sheet 右键单元格；Doc 在 **Insert** 标签页；Slide 右键元素；Base 在记录的操作里；Board 在左侧工具栏 |
| 编辑历史 | Sheet、Doc、Slide、Base、Board | Sheet、Doc、Slide、Base 在功能区；Board 在右上角设置菜单 |

导出时使用已转换附件的在线版本，在转换出的 Unit 里做的修改会进入导出文件。

有两处空缺来自包本身：Exchange Service 不转换 Board，Univer 没有 PDF 的评论和历史 UI。
`web/univer/features/` 下的每个能力模块只为自己覆盖的 Unit 类型注册 UI，其余类型跳过。

PDF 转换在 `@univerjs-pro/exchange-node` 里是可选模块：`server/main.ts` 引入了 `@univerjs-pro/exchange-node/pdf`，
示例依赖 `@univerjs-pro/exchange-pdf-node-binding`。从 PDF 文件导入的 Unit 可以连同编辑一起导出。侧边栏里空白创建的
`PDF` Unit 在没有内容时可以导出，但加入文字框后导出会失败，错误是 `source-less PDF cannot apply imported semantic patches`：
导出器把文字编辑应用到源 PDF 上，而这个 Unit 没有源文件。

建议一起阅读：

- `server/main.ts`：组装协同、File、Exchange、Comment 和 History 的 Service 与 Endpoint。它们共用
  `.data/collaboration.sqlite`，文件内容写入 `.data/files`。
- `server/units.ts`：定义六个 Unit，只创建缺失的 Unit。
- `web/univer/mount-editor.ts`：创建编辑器，并按 Unit 类型注册各项能力，能力代码在
  `web/univer/features/`。
- `web/univer/units/`：组装每种 Unit 的插件。
- `web/univer/features/import-export/`：导入导出的菜单、对话框和上传通知。Univer 1.2.0 起 exchange 包不再内置这些，
  这里按 Unit 类型抄自 [Univer showcase 的迁移示例](https://office.univer.ai/showcase/sheets/custom-import-export)，只保留 `en-US` 和 `zh-CN` 语言。
  这些视图用到的 Tailwind 类有一部分没有任何 Univer 包提供，由 `import-export/utilities.css` 补齐。

导入和转换出的 Unit 不在侧边栏里。它们的链接带类型，形如 `/?unit=<id>&type=<type>`，由
`shared/units.ts` 生成。

当前编辑器的 `univer` 和 `univerAPI` 挂在 `window` 上，方便在浏览器控制台调试。

所有请求都是固定的 `demo-user`，所有操作都被允许。这只是本地教学配置，不包含登录、成员和权限；
这些内容见 [`permissions`](../permissions/README.zh-CN.md) 示例。

Unit、评论、历史和文件在重启后都会保留，删除 `.data` 可以重新开始。`HOST`、`PORT`、`DATABASE_PATH`、
`FILES_PATH` 可以覆盖服务端默认值。Exchange 任务只存在于当前进程，进程停止后会丢失。

```bash
pnpm --filter @univerjs/collaboration-example-all-unit typecheck
```
