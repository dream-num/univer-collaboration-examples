# 可选能力

[English](./extensions.md) | 简体中文

先完成 Collaboration 主线，再按产品需求选择可选能力。History、Thread Comment 和 Worktree
都有独立的 Service、middleware 和 Database Adapter，但可以复用同一个 Transport、应用
认证以及 SQLite 文件。服务端 Office 导入导出则组合应用拥有的 HTTP 路由与文件/任务基础设施、
Collaboration Service snapshot API 和 `exchange-node`。

| 需求 | 增加什么 | 先运行的 example |
| --- | --- | --- |
| 面向用户的版本历史 | History Service + Endpoint + Adapter | [History](../examples/history/README.zh-CN.md) |
| Sheet/Doc Thread Comment | Comment Service + Endpoint + Adapter | [Comments](../examples/comments/README.zh-CN.md) |
| 隔离 draft、评审并合入 trunk | Worktree Service + Endpoint + Client + Adapter | [Worktree](../examples/worktree/README.zh-CN.md) |
| 服务端 Office 导入导出 | Exchange Node + 应用路由 + Unit materialization | [Exchange](../examples/exchange/README.zh-CN.md) |

每个 example 的 `server/main.ts` 和 `web/main.ts` 是推荐的组装参考。具体构造参数、API、
middleware action 和资源释放以对应 Package README 为准。

## History

History 把 confirmed revisions 分组为面向用户的历史条目，并补全创建者资料。它是协同数据
的派生索引，Collaboration Service 保存的 confirmed changesets 才是 Unit 状态的权威来源。

```text
Transport
├─→ UniverHistoryEndpoint → UniverHistoryService → History Adapter
└─→ UniverCollabEndpoint  → UniverCollabService  → core Adapter
```

接入时先组装 core，再创建 History Service 并 `attach(collabService)`，最后把 History
Endpoint 和主 Endpoint 注册到同一个 Transport。History Service 有独立 middleware；
User Provider 只补全姓名和头像，不是权限边界。

`attach()` 适合进程内更新派生索引，失败不会回滚已经确认的协同数据。若要求历史索引严格
不丢失，应在协同提交事务中写 transactional outbox，再由可重复执行的任务更新 History。

## Thread Comment

Comment Service 保存评论正文、回复、编辑和 solved 状态；会随 Sheet/Doc 结构变化的 root
anchor 仍属于主协同 snapshot/changeset。两部分都要纳入产品的数据生命周期。

```text
Transport
├─→ UniverCommentEndpoint → UniverCommentService → Comment Adapter
└─→ UniverCollabEndpoint  → UniverCollabService  → core Adapter
```

Comment Endpoint 通过主 Endpoint 的 Unit room 发布 `comment_update`，因此创建时要把主
Endpoint 作为 `roomHost`。读取评论是普通 HTTP；写评论会关联已经 JOIN 的在线 Session。
所有路由使用当前 Transport HTTP 请求的 `userID/customData` 调用 Comment Service，Comment
权限安装在 Comment Service middleware。

实时更新失败不会回滚已经提交的评论，客户端可以重新 list 恢复。当前实时广播仍只覆盖
一个主 Endpoint 进程。

## Worktree

Worktree 为一个或多个 Unit 提供隔离的协同 draft，以及 ready、reopen、discard、合入评估
和逐 Unit merge。它复用 trunk Service 的 OT 和提交引擎，但 draft changesets、状态和实时
房间都按 `(worktreeID, unitID)` 隔离。

```text
Transport
├─→ Worktree Endpoint → Worktree Service → Worktree Adapter
└─→ trunk Endpoint    → trunk Service    → core Adapter
```

trunk Endpoint 与 Worktree Endpoint 必须共享同一个 session ticket store；当前提供的内存
实现适用于它们位于同一进程的推荐拓扑。除此之外，两套 Endpoint、Service 和 Adapter 都是
独立生命周期对象。

```text
create → draft → ready → merging → merged
           ↑       │
           └ reopen┘

draft / ready → discarded
```

只有 `draft` 可以继续提交。`markReady` 冻结各 Unit 当前 draft revision；多 Unit merge 按
Unit 推进，不保证跨 Unit 原子性，产品 UI 应展示每个 Unit 的 merge result。

Worktree middleware 与 trunk Service middleware 相互独立：前者保护 draft 可见性、编辑和
merge，最终写入 trunk 时仍会进入 trunk Service 自己的权限 middleware。Worktree 的实时
房间、状态事件和广播当前同样只保证单 Endpoint 进程。

## 服务端 Office 导入导出

应用可以使用 `@univerjs-pro/exchange-node` 转换 Office 文件。导入得到 Protocol snapshot
及其 Sheet blocks，可通过 `createUnitFromSnapshot()` 持久化；导出需要同一个 confirmed
revision 上的完整 snapshot。先用 `getUnitLoadDataWithBlocks()` 读取自包含恢复材料，再用
`UnitSnapshotMaterializer` 重放 confirmed tail：

```ts
import { UnitSnapshotMaterializer } from '@univerjs-pro/collaboration-service';
import { exportSnapshotToBuffer } from '@univerjs-pro/exchange-node';

const loadData = await collabService.getUnitLoadDataWithBlocks(
  { unitID, type, revision: 0 },
  { userID }
);
const materializer = new UnitSnapshotMaterializer();
try {
  const complete = await materializer.materializeSnapshot(loadData);
  const output = await exportSnapshotToBuffer(complete, exportOptions);
  // complete.snapshot.rev === loadData.targetRevision
} finally {
  await materializer.dispose();
}
```

`revision: 0` 在调用开始时把当前数据库 head 固定为本次 `targetRevision`。返回值包含最近持久化
snapshot、该 snapshot 引用的全部 Sheet blocks，以及抵达目标所需的连续 confirmed tail。
`UnitSnapshotMaterializer` 在内存中补全 snapshot，返回结果不会自动保存；调用方应在使用完毕后
释放 materializer。

Collaboration SDK 不提供 Exchange Endpoint。上传、导入导出、任务轮询、签名下载、权限、
配额、对象存储和 worker 隔离均由应用拥有。前端 Exchange plugins 所需的最小协议见 Exchange
example。

## 共同的存储和生命周期规则

- core、History、Comment 和 Worktree SQLite Adapter 可以使用同一个数据库文件，但它们是
  不同契约和资源对象，需要分别创建和释放。
- 可选 Service 不继承主 Service middleware；应用必须分别安装所需的读取和写入策略。
- core hard delete 不会自动清理其他模块的数据，跨模块删除和保留策略由应用协调。
- 所有 Collaboration 和 Univer package 必须使用同一匹配 release cohort 的精确版本。
