# Unit 内部对象权限方案

> 状态：方案草案，尚未实现。

## 目标

在现有 Unit ACL 基础上支持 Unit 内部对象权限，同时保持三条边界清晰：

1. Collaboration SDK 理解 mutation 和当前 Unit 状态，并向服务端 middleware 提供可执行的权限需求。
2. 应用实现 middleware，根据自己的用户、角色和 ACL 决定是否允许服务端操作。
3. 前端 SDK 通过标准 `IAuthzIoService` 查询和管理权限，应用实现对应的 Authz HTTP 接口。

角色、组织、租户、ACL 存储以及角色与 action 的映射仍属于应用策略。SDK 不内置
`creator`、`editor`、`viewer` 等产品角色，也不新增名为 `authorize` 的 middleware
action。

## 当前能力

- Sheet、Doc、Slide、Board 和 Base 都支持 Unit 根对象权限查询。
- 标准客户端当前只有 Sheet 会为内部对象请求服务端权限：
  - `UnitObject.Worksheet`
  - `UnitObject.SelectRange`
- 其他 Unit 虽然定义了 `DocumentSection`、`SlideElement`、`BaseTable`、
  `BoardElement` 等枚举，但当前标准客户端不会为它们请求 Authz HTTP 接口。
- 当前 Collaboration SDK 尚不能从 mutation 推导 Worksheet/Range 权限需求，因此
  内部对象权限还没有形成完整的服务端安全闭环。

第一阶段只实现 Sheet 的 Worksheet 和 SelectRange，不提前实现其他 Unit 的内部对象。

## 总体流程

```text
权限查询
Client permission point
→ IAuthzIoService.allowed / batchAllowed
→ 应用 Authz HTTP 接口
→ 应用 ACL resolver
→ allowed actions
→ IPermissionService
→ Ribbon / 菜单 / 命令拦截

协同写入
Client mutation
→ Collaboration Endpoint
→ Collaboration Service
→ Runtime 根据当前 head 分析 mutation
→ permissionRequirements
→ applyChangeset middleware
→ 应用 ACL resolver
→ 允许后 apply / commit

权限配置
Client permission UI / Facade
→ IAuthzIoService.create / update / collaborator methods
→ 应用 Authz HTTP 接口保存 ACL
→ protection rule mutation 保存 permissionId 和保护范围
→ 协同提交并通知其他客户端刷新权限
```

## 一、服务端 mutation 权限检查

### SDK 职责

SDK 已经能够在 `applyChangeset` middleware context 中提供：

- `ctx.userID`
- `ctx.memberID`
- `ctx.attempt`
- `ctx.currentRevision`
- `ctx.changeset`
- `ctx.changeset.unitID`
- `ctx.changeset.mutations`

其中 `unitID` 已经可以通过 `ctx.changeset.unitID` 获取，不需要再增加一个重复的顶层
字段。缺少的是 SDK 根据当前 Runtime、保护规则和 mutations 计算出的权限需求。

建议扩展现有 `ApplyChangesetMiddlewareContext`：

```ts
interface PermissionRequirement {
  readonly unitID: string;
  readonly objectID: string;
  readonly objectType: UnitObject;
  readonly action: UnitAction;
  readonly mutationIndex: number;
  readonly mutationID: string;
}

interface ApplyChangesetMiddlewareContext {
  // Existing fields are omitted.
  readonly permissionRequirements: readonly PermissionRequirement[];
}
```

`permissionRequirements` 使用协议中的 `UnitObject` 和 `UnitAction`，只描述 mutation
需要哪些权限，不包含用户角色或最终 `allowed` 结果。

SDK 负责：

- 理解每种 Unit Runtime 的 mutation 语义。
- 根据当前 confirmed head 找到 mutation 影响的 Worksheet、SelectRange 和保护规则。
- 把 mutation 映射成对应的 `objectID + objectType + action`。
- 校验 mutation 引用的 permission object 确实属于当前 Unit，且类型匹配。
- 对同一 changeset 中修改保护规则和内容的 mutations 按真实应用顺序分析，避免通过
  先删除保护再修改内容绕过权限。

应用不应在 examples 中维护一套 mutation ID 解析器，也不应复制客户端命令拦截逻辑。

### 为什么放在 `applyChangeset`

`submitChangeset` 每次逻辑提交只执行一次，适合做 Unit 级 Edit 权限、限流和大小限制。

`applyChangeset` 会在 CAS 冲突后使用最新 head 重试。Worksheet/Range 保护规则可能已经
变化，因此内部对象权限需求必须在每次 apply attempt 中根据当前 Runtime 重新计算和
检查。

不新增 `authorize` middleware action。权限检查仍是现有 `applyChangeset` 生命周期的
应用用途。

### 应用 middleware 职责

开发者通过 middleware 实现自己的 ACL：

```ts
collabService.use('applyChangeset', async (ctx, next) => {
  const allowed = await acl.areAllowed({
    userID: ctx.userID,
    unitID: ctx.changeset.unitID,
    requirements: ctx.permissionRequirements,
    customData: ctx.customData,
  });

  if (!allowed) {
    throw new CollabError('PERMISSION_DENIED', 'Permission denied');
  }

  await next();
});
```

应用负责决定：

- 用户如何映射成 Unit 或对象角色。
- 角色允许哪些 `UnitAction`。
- creator/owner 是否绕过内部保护。
- public、organization、explicit collaborator 等分享策略。
- ACL 缓存、审计和外部权限系统集成。

第一版建议让对象权限只收紧 Unit 权限：

```text
effectiveAllowed = unitAllowed && objectAllowed
```

Unit viewer 不会因为某个 Range ACL 获得整个 Unit 的 Edit 权限；Unit editor 可以被
Worksheet 或 Range 保护规则进一步限制。

## 二、客户端 UI 权限查询

前端 feature 向 `IPermissionService` 注册 permission points，并通过
`IAuthzIoService` 查询服务端：

- `allowed(config)`：查询单个对象的多个 actions。
- `batchAllowed(configs)`：批量查询多个对象。

标准 HTTP client 会把聚合后的请求发送到：

```http
POST {authzUrl}/-/object/-/batch_allowed
```

应用服务端实现该接口，根据认证用户、`unitID`、`objectID`、`objectType` 和 actions
返回每个 action 的 `allowed`。响应随后写回 `IPermissionService`，Ribbon、菜单、命令
拦截、复制和评论等 UI 消费这些 permission points。

该接口只控制客户端能力和交互，不是安全边界。应用必须让它和服务端 middleware 使用
同一个 ACL resolver，避免客户端显示允许但服务端拒绝，或者客户端隐藏了实际允许的
能力。

对于 Sheet 内部对象：

- Worksheet/SelectRange 请求中的 `objectID` 是保护规则的 `permissionId`。
- `objectID` 不是 worksheet ID，也不是 range 坐标。
- 同一 Unit 内的 `permissionId` 必须唯一。
- 不存在、类型不匹配或不属于当前 Unit 的 permission object 默认拒绝。

## 三、客户端权限点配置

标准权限 UI 或 Facade 使用 `IAuthzIoService` 的以下方法管理权限对象：

- `create()`：创建 permission object，返回 `permissionId`。
- `update()`：更新名称、策略、scope 或 collaborators。
- `list()`：查询 permission objects；当前内置生产流程通常不依赖它。
- `listRoles()`：查询对象角色；当前内置生产流程通常不依赖它。
- `listCollaborators()`
- `createCollaborator()`
- `updateCollaborator()`
- `deleteCollaborator()`
- `putCollaborators()`

应用实现对应的 Authz HTTP 接口。至少包括：

| 操作 | HTTP 接口 |
| --- | --- |
| 创建权限对象 | `POST {authzUrl}/{objectType}/object` |
| 更新权限对象 | `PUT {authzUrl}/{objectType}/object/{objectID}` |
| 查询协作者 | `GET {authzUrl}/collaborator` |
| 新增协作者 | `POST {authzUrl}/collaborator` |
| 更新协作者 | `PATCH {authzUrl}/collaborator` |
| 删除协作者 | `DELETE {authzUrl}/collaborator` |
| 覆盖协作者集合 | `PUT {authzUrl}/collaborator` |

### 权限配置中的两类数据

Sheet 内部权限配置包含两类数据，不能混为一个存储：

1. **保护结构**：Worksheet、Range 坐标和 `permissionId` 的关联。它属于 Unit 内容，
   通过 Sheet protection mutation 写入 snapshot，并走正常协同和 revision。
2. **ACL 数据**：permission object 的 creator、roles、strategies、scope 和
   collaborators。它由应用 Authz HTTP 接口保存到应用数据库。

创建 Range protection 的典型顺序是：

```text
IAuthzIoService.create()
→ 服务端创建 ACL 对象并返回 permissionId
→ 客户端提交 AddRangeProtection mutation
→ mutation 把 permissionId、subUnitId 和 ranges 写入 Unit 内容
```

如果 ACL 对象创建成功但 protection mutation 提交失败，会产生未被 Unit snapshot 引用
的 permission object。第一版可以把它视为 pending/orphan，并通过超时或引用扫描清理；
不要复用已发放的 `permissionId`。

权限对象的 collaborators 或策略变化后，服务端需要通过标准权限变更事件通知在线客户
端重新请求对应 `permissionId`。如果 Collaboration SDK 尚未公开安全的权限刷新发布
能力，应先在 SDK 设计该能力，不在 examples 中手写实时协议。

## 数据模型建议

应用数据库只存 ACL，不重复存储 Range 几何信息：

```text
permission_objects
- unit_id
- object_id            // permissionId
- object_type          // Worksheet / SelectRange
- creator_user_id
- name
- strategies
- scope
- state                // pending / active / orphan / deleted
- created_at
- updated_at

permission_object_collaborators
- unit_id
- object_id
- user_id
- role                  // protocol UnitRole: Reader / Editor / Owner
- created_at
- updated_at
```

对象身份使用 `(unit_id, object_id)`；读取时同时验证 `object_type`。Worksheet ID、
subUnitId 和 Range 坐标继续以 Unit snapshot 中的 protection rule 为准。

## 实施顺序

1. 在 Collaboration SDK 中定义 `PermissionRequirement`，由 Sheet Runtime 从当前 head
   和 mutation 推导 requirements。
2. 扩展 `applyChangeset` middleware context，并覆盖 CAS retry、保护规则并发变化、
   同 changeset 删除保护后修改内容等测试。
3. 在 examples 中实现 permission object/协作者存储和统一 ACL resolver。
4. 扩展 `batch_allowed`，区分 Unit 根对象与 Worksheet/SelectRange permission object。
5. 实现标准 Authz permission object 和 collaborator HTTP 接口。
6. 接入服务端 `applyChangeset` middleware 强制检查。
7. 实现标准权限刷新通知后，再启用客户端 Worksheet/Range 权限管理 UI。
8. 完成浏览器正常路径和伪造 mutation 的服务端拒绝测试。

在第 6 步完成前，Worksheet/Range 权限只能视为客户端 UI 限制，不能声明为安全的对象
级权限实现。

## 暂不处理

- Doc、Slide、Board 和 Base 内部对象权限。
- 自定义组织、部门和用户组模型。
- 非标准客户端自定义 permission points。
- 为尚无客户端调用方的 `UnitObject` 提前实现 HTTP contract。
