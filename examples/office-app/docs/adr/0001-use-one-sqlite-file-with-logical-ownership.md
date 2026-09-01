---
status: accepted
---

# Use one SQLite file with logical ownership

Office App 将用户、Session、Unit metadata、成员、Exchange 任务以及 Core Collaboration、
Comment、History Adapter 数据统一保存在 `.data/office-app.sqlite`，以简化示例的启动、备份和
重置。共用物理文件不改变所有权：应用只管理 `app_*` 表，各 SDK Adapter 只管理自己的
`collaboration_*` 表，应用不得直接 join 或迁移私有表；各组件仍使用独立公开事务边界，因此
创建、删除和恢复继续通过显式中间状态及启动恢复编排，而不假设跨 Adapter 原子事务。
