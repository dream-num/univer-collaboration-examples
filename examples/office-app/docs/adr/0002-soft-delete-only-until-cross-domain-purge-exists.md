---
status: accepted
---

# Expose only soft delete until cross-domain purge exists

Office App 只开放 soft delete 和 recover，不开放 Collaboration Service 已支持的 hard delete。
Core Adapter 的 hard delete 不会自动清理应用 Unit metadata、Comment、History 和 Exchange 文件；
在没有统一事务或可靠 purge workflow 前开放永久删除，会同时产生不可恢复状态和跨领域残留。
未来只有在这些数据面的删除所有权和失败恢复被明确实现后，才能增加清空回收站。
