# 综合集成示例

[English](./README.md)

这是一个组合 Univer Collaboration SDK 多项能力的中英文可运行示例，展示用户认证、Unit 列表、
创建者/编辑者/查看者三种角色、五类 Unit 协同、评论、版本历史、软删除与恢复，以及本地 Office
导入导出的接入方式。

本示例用于学习和参考 SDK 集成，不代表覆盖全部 SDK 能力，也不作为生产应用模板。

## 运行

在仓库根目录执行：

```bash
pnpm install
pnpm example:all-integration
```

打开 <http://127.0.0.1:3015>，注册用户后即可新建 Unit，或将 Office 文件导入为 Unit。应用表与 Collaboration、Comment、
History Adapter 的表共用 `.data/collaboration.sqlite`；物理文件共用不改变各组件的表所有权。

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

## 能力矩阵

| 能力 | Sheet | Doc | Slide | Board | Base |
| --- | --- | --- | --- | --- | --- |
| 创建、协同、历史 | 支持 | 支持 | 支持 | 支持 | 支持 |
| Thread Comments | 支持 | 支持 | 支持 | 支持 | 支持 |
| 导入 | XLS/XLSX/CSV/TSV | DOC/DOCX | PPT/PPTX | 不支持 | XLS/XLSX/CSV/TSV |
| 导出 | XLSX/CSV/TSV | DOCX | PPTX | 不支持 | XLSX/CSV/TSV |
