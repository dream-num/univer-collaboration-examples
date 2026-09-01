# Office App

[English](./README.md)

这是一个基于 Univer Collaboration SDK 公开能力构建的中英文办公工作区示例。它组合了真实
用户、Unit 列表、创建者/编辑者/查看者三种角色、五类 Unit、Sheet/Doc 评论、版本历史、软删除
与恢复，以及本地 Office 导入导出。

## 运行

在仓库根目录执行：

```bash
pnpm install
pnpm example:office-app
```

打开 <http://127.0.0.1:3015>，注册用户后即可新建 Unit，或将 Office 文件导入为 Unit。应用表与 Collaboration、Comment、
History Adapter 的表共用 `.data/office-app.sqlite`；物理文件共用不改变各组件的表所有权。

## 源码目录

```text
src/
├── client/          React shell、页面、Univer 装配和语言包
├── server/          Express 组合入口和按功能划分的服务端模块
│   ├── auth/        Session 认证
│   ├── units/       Unit metadata、成员、内容和生命周期
│   ├── collaboration/  SDK Service、Endpoint、ACL 和 History 索引
│   └── exchange/    本地 Office 导入导出
└── shared/          前后端共用的少量 API 和 Unit 契约
```

这是 examples，因此功能目录刻意保持扁平：routes 只转换 HTTP，service 编排用例，repository
管理应用 SQL；没有额外引入 DI 容器、ORM 或通用领域层。

## 能力矩阵

| 能力 | Sheet | Doc | Slide | Board | Base |
| --- | --- | --- | --- | --- | --- |
| 创建、协同、历史 | 支持 | 支持 | 支持 | 支持 | 支持 |
| Thread Comments | 支持 | 支持 | 不支持 | 不支持 | 不支持 |
| 导入 | XLS/XLSX/CSV/TSV | DOC/DOCX | PPT/PPTX | 不支持 | XLS/XLSX/CSV/TSV |
| 导出 | XLSX/CSV/TSV | DOCX | PPTX | 不支持 | XLSX/CSV/TSV |

History 索引使用 `historyService.attach(collabService)`。这是刻意保持精简的进程内便利装配：进程
在 Collaboration commit 和 History 写入之间崩溃时可能漏索引。生产环境应使用 transactional
outbox 和显式 History 索引 API。

安装基线 `1.0.0-beta.2` 的通用 History loader 只支持 Sheet，而五类专用 History UI 包当前未在
公共 registry 提供。因此示例为五类 Unit 提供统一的应用层历史抽屉，并通过公开
`RevertRevisionMutation` 提交恢复；替换为各类型原生预览 UI 已在[设计文档](./docs/design.md#history)
记录为单独 TODO。

本示例用于教学，不是生产身份或 Unit 管理基础设施。Session 虽然只保存 hash，但没有邮箱验证、密码
找回、限流、对象存储、transactional outbox 或多进程实时 fanout。

继续阅读：[需求](./docs/requirements.md)、[设计](./docs/design.md)和[领域词汇](./CONTEXT.md)。
