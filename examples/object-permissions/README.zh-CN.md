# Object Permissions

[English](./README.md) | 简体中文

## 概述

这个示例演示协同 Sheet 里的工作表保护和区域保护。文件角色决定谁能看、谁能改整份文件；保护对象再限制其中一块工作表或一个区域。文件角色的接法见 [`permissions`](../permissions/README.zh-CN.md)。

## 启动

```bash
pnpm example:object-permissions
```

打开 <http://127.0.0.1:3010>。四个账号和 [`permissions`](../permissions/README.zh-CN.md) 相同：Alice 是创建者，Bob 是编辑者，Casey 是查看者，Dana 可以登录但没有这份文件的角色。切换账号会写入本地演示 Cookie。

协同数据和 ACL 都在 `.data/collaboration.sqlite`。服务重启后，保护和文件角色都还在。角色表现在写在内存 `Map` 里；换成数据库时，角色表要和 ACL 表一起保留。

## 试一下

### 创建一块区域保护

以 Alice 登录，选中 B2:B3。从工具栏的「保护」，或从工作表标签，添加区域保护。编辑器右侧会打开标题为「保护行列」的面板。保持默认：仅我可以编辑，其他人可以查看。

客户端发送：

`POST /universer-api/authz/3/object`

路径里的 `3` 是 `UnitObject.SelectRange`。工作表保护是 `2`。

```json
{
  "objectType": 3,
  "selectRangeObject": {
    "unitID": "object-permissions-sheet",
    "name": "",
    "collaborators": [],
    "scope": { "read": 1, "edit": 2 }
  }
}
```

`read: 1` 是所有协作者可以查看，`edit: 2` 是仅创建者可以编辑。指定 Bob 可编辑时，`edit` 改成 `0`，`collaborators` 里出现 Bob，`role` 为 `1`（Editor）。

应用保存这条 ACL，把当前用户记为创建者，并返回：

```json
{ "error": { "code": 1, "message": "" }, "objectID": "新的 permissionId" }
```

在面板里确认后，客户端用 changeset 把 B2:B3 绑到这个 `objectID`。区域地址写在这条 changeset 里。

在面板里添加人员时，请求文件成员：

`GET /universer-api/authz/collaborator?unitID=object-permissions-sheet&objectID=object-permissions-sheet`

`objectID` 与 `unitID` 相同，返回文件成员，不返回某一块区域上的人。`id` 用 userID。

### 验证

1. 换 Bob。他仍可编辑表格其余部分。改 B2 时，Service 以 `PERMISSION_DENIED` 拒绝这次 changeset。改 A1 可以保存。
2. 以 Alice 编辑该区域策略，把 Bob 加为对象的编辑者。Bob 再改 B2，可以保存。服务端对新提交立即按新策略裁决。已经打开的页面要等下一次 `batch_allowed` 才刷新工具栏。
3. 换 Casey。整张表都不能改，因为文件角色没有 Edit。区域上写了允许也没用。
4. 重启服务后再用 Bob 打开。保护还在。

只做界面拦截时，伪造的提交仍能写入。`commitChangeset` 里的检查才是安全边界。

## SDK 与应用的边界

| SDK | 应用 |
| --- | --- |
| 分析提交的 changeset 所需的权限点，供应用检查 | 保存保护对象、策略、scope 和协作者，并用 `isObjectActionAllowed` 裁决 |
| `@univerjs/sheets-ui` 的「保护行列」面板 | `authzUrl` 下面的 HTTP |

## 接到你的服务

| 示例文件 | 接到你的项目里时 |
| --- | --- |
| `web/main.ts` | 协同插件加上 `authzUrl`、`objectPermissionTypes`，并把当前用户的 `userID` 设成和后端一致 |
| `server/permissions.ts` | 文件角色。把内存 `Map` 换成你的用户系统。动作划分见 [`permissions`](../permissions/README.zh-CN.md) |
| `server/acl.ts` | 保护对象的存储和 `isObjectActionAllowed`。表可以换，这个函数的规则先保持 |
| `server/authz.ts` | 挂到 `authzUrl` 下面的 HTTP |
| `server/main.ts` | 身份、三个文件级钩子、`enableUnitPermissionAnalysis`、`commitChangeset` |

`server/users.ts` 里的 Cookie 只为演示。

### 1. 前后端使用同一个 userID

```ts
transport.use(async (context, next) => {
  const user = currentUser(context.incomingMessage);
  if (!user) {
    context.response.statusCode = 401;
    context.response.end("Sign in first");
    return;
  }
  context.userID = user.userId;
  await next();
});
```

```ts
univer.__getInjector().get(UserManagerService).setCurrentUser({
  userID: user.userId,
  name: user.username,
  avatar: user.avatar,
});
```

```ts
authzUrl: `${location.protocol}//${location.host}/universer-api/authz`,
objectPermissionTypes: [UnitObject.Worksheet, UnitObject.SelectRange],
```

`objectPermissionTypes` 需要配置。工作表保护列入 `UnitObject.Worksheet`，区域保护列入 `UnitObject.SelectRange`。

这一步通过的标志：未登录调用协同接口得到 401；登录后，后面所有权限请求都带着这个用户。

### 2. 先做文件角色

区域保护叠在文件角色上面。三个钩子和 [`permissions`](../permissions/README.zh-CN.md) 相同，角色函数是 `isUnitActionAllowed`：

```ts
service.use("readUnitData", async (context, next) => {
  if (!isUnitActionAllowed(context.userID, context.request.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot read this Unit");
  await next();
});
service.use("submitChangeset", async (context, next) => {
  if (!isUnitActionAllowed(context.userID, context.request.changeset.unitID, UnitAction.Edit))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
endpoint.use("joinUnit", async (context, next) => {
  if (!isUnitActionAllowed(context.session.userID, context.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
  await next();
});
```

这一步通过的标志：Casey 改任意格子，提交被拒绝，此时还没有区域保护。

### 3. 实现 batch_allowed

路由挂载在 `server/main.ts`：

```ts
app.use("/universer-api/authz", express.json({ limit: "64kb" }), createAuthzRouter({ store: acl, requireUser }));
```

`objectID` 等于 `unitID` 时按文件角色回答，请求形状见 [`permissions`](../permissions/README.zh-CN.md)。保护对象走 `server/acl.ts` 的 `isObjectActionAllowed`。按钮灰不灰看这个响应。它不代替第 5 步的提交检查。

### 4. 实现「保护行列」面板调用的接口

从工具栏「保护」或工作表标签添加区域保护时，这个面板会调用下面的路由，都在 `server/authz.ts`：

| 方法 | 路径 | 何时调用 |
| --- | --- | --- |
| POST | `/-/object/-/batch_allowed` | 打开文件、刷新按钮和保护状态 |
| POST | `/-/object/list` | 读取已有保护对象 |
| POST | `/:objectType/object` | 新建区域或工作表保护 |
| PUT | `/:objectType/object/:objectId` | 改范围、改开关、改编辑名单 |
| GET | `/collaborator` | 选人框拉取候选人 |

`PUT` 时如果 `strategies` 是空数组，保持原策略，不要写成空。示例用 `body.strategies.length` 判断。选人、范围和开关都写在创建和更新里，没有单独的协作者写入接口。

工作表上的操作开关（复制、改值、插入行列等）走 `PUT`，每个动作一条 strategy：开着 `role` 为 1（Editor），关掉 `role` 为 2（Owner）。没有评论开关。

### 5. 提交时用同一函数拒绝

在构造 Service 时打开 `enableUnitPermissionAnalysis`。Service 分析提交的 changeset 所需的权限点，供应用在 `commitChangeset` 里检查。分析结果在适配器落库之前挂到这个 middleware 上。见 `server/main.ts`：

```ts
const service = new UniverCollabService({
  dbAdapter: database,
  enableUnitPermissionAnalysis: true,
});

service.use("commitChangeset", async (context, next) => {
  for (const requirement of context.requiredUnitPermissions) {
    const granted = isObjectActionAllowed(acl, context.userID, {
      unitID: requirement.unitID,
      objectID: requirement.objectID,
      objectType: requirement.objectType,
      action: requirement.action,
    });
    if (!granted) {
      throw new CollabError("PERMISSION_DENIED", "Permission denied");
    }
  }
  await next();
});
```

这个开关默认是关的。关着时，以及打开之后这次提交没有对象级要求时，`requiredUnitPermissions` 都是空数组。循环里没有条目，不会拒绝这次编辑。关着时 Bob 改 B2 会成功。文件级的读、加入房间和提交钩子照常执行。

打开之后，Bob 改 B2 时，其中一条 requirement 的 `objectID` 就是创建这块区域时返回的 `permissionId`，`action` 是 Edit。`isObjectActionAllowed` 返回 false，这次 changeset 整个被拒绝。他改 A1 时，要求落在工作簿 Edit 上，文件角色允许，写入成功。

判断规则就在 `isObjectActionAllowed`，接的时候保持这一套。保护对象的 `objectID` 是创建时返回的 `permissionId`。

1. `objectID === unitID`：只看文件角色。
2. 其他动作先看文件角色。查看者连文件 Edit 都没有，区域上写了允许也没用。
3. 创建者始终是该对象的 Owner。
4. 查看：`scope.read` 为所有协作者时，文件成员可以看。
5. 编辑：`scope.edit` 为所有协作者时，文件编辑者可以改；为仅自己时，只有创建者可以改；为指定人时，只看 collaborators 里的 Editor。
6. 动作的最低角色先取对象上保存的 strategies。没有这条策略时，View、Copy、Comment、ViewHistory 默认 Reader，ManageCollaborator 和 Delete 默认 Owner，其他动作默认 Editor。

### 验收

1. 未登录访问协同接口，得到 401。
2. Casey 登录后不能编辑；她提交修改，服务端 `PERMISSION_DENIED`。
3. Alice 保护 B2:B3。网络面板里有 `POST /universer-api/authz/3/object`，响应里有 `objectID`。
4. Bob 改 B2，提交被拒绝；改 A1，可以保存。
5. Alice 把 Bob 加为这块区域的编辑者。Bob 再改 B2，可以保存。
6. 重启服务后再用 Bob 打开。保护还在。

## 说明

Doc、Slide、Board 和 Base 复用相同的协议 payload，对象类型不同。加入对应的 `objectPermissionTypes` 之后，`commitChangeset` 的校验模式相同。

删掉一块保护、撤销或恢复历史时，changeset 可能再次带上原来的 `permissionId`。不要因为某一次提交里有删除，就把 ACL 行删掉。提交成功后，`changesetCommitted.requiredUnitPermissions` 可用来激活 pending 的权限对象。

本示例只覆盖 Sheet 对象，且未实现策略变更的推送。要让已连接的客户端立刻看到新策略，通知它重新拉权限，或断开它的协同连接。
