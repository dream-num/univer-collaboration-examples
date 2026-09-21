# Object Permissions

[English](./README.md) | 简体中文

演示应用如何实施文档内部（对象级）权限：协同 Sheet 中的工作表保护与区域保护。Collaboration
Service 负责计算每条 mutation 需要哪个 `UnitObject + UnitAction`;ACL 由应用持有并裁决。

```bash
pnpm example:object-permissions
```

打开 <http://127.0.0.1:3010>。页面提供三个 demo 账户：Alice 是文档创建者，Bob 是编辑者，
Casey 是只读成员。切换账户会写入本地 demo Cookie；生产应用应替换为自己的 Session 或
Bearer token。

## 动手试一下

1. 以 **Alice** 登录，选中 B2:B3，从工具栏或 sheet 标签栏添加区域保护，只保留
   Alice 可编辑。
2. 切换为 **Bob**：他仍可编辑表格其余部分，但受保护区域会拒绝他的修改——是 Service 以
   `PERMISSION_DENIED` 拒绝了他的 changeset，而不只是 UI 拦截。
3. 以 Alice 编辑该区域策略，把 Bob 加为对象的编辑者，Bob 随即可以编辑该区域。策略修改对
   新提交立即生效。
4. 重启服务：保护仍然生效，因为 ACL 与协同数据一起保存在 `.data/collaboration.sqlite`。

观察浏览器 Network 里的 `batch_allowed` 调用——客户端用它渲染工具栏状态。客户端提示永远
不是安全边界：同一个策略函数既回答这些查询，也在服务端拒绝越权 mutation。

## 代码导览

- `server/main.ts` — 开启 `enableUnitPermissionAnalysis`，并在 `applyChangeset` middleware
  中校验 `context.requiredUnitPermissions`。requirements 之间是 AND 关系；Worksheet 和
  SelectRange 的 `objectID` 是保护规则的 `permissionId`，不是 worksheet ID 或区域地址。
  空 requirement 列表绝不代表"已授权"。
- `server/authz.ts` — 客户端权限面板通过 `authzUrl` 调用的 HTTP 契约：批量权限查询、对象
  创建/更新和协作者管理。
- `server/acl.ts` — 应用持有的 ACL:permission object、策略、scope 和协作者，持久化为两张表。
- `server/permissions.ts` — Unit 级角色策略，对象级校验叠加在其之上。
- `web/main.ts` — 通过 `objectPermissionTypes: [UnitObject.Worksheet, UnitObject.SelectRange]`
  开启对象权限，并把 `authzUrl` 指向应用。保护对话框由 `@univerjs/sheets-ui` 内置提供，
  无需额外插件。

## 说明

- Doc、Slide、Board 和 Base 复用相同的协议 payload，只是对象类型不同；加入对应对象类型后，
  `applyChangeset` 的校验模式完全一致。
- 提交成功后，`changesetCommitted.requiredUnitPermissions` 可用来激活 pending 的权限对象。
  不要根据单次提交回收 ACL——撤销/重做和历史恢复可能再次引用同一个 `permissionId`。
- 本示例只覆盖 Sheet 对象，且未实现策略变更的推送通知；已连接客户端会在下一次权限查询时
  获取新策略。
