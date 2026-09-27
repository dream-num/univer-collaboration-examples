# 接入工作表和区域保护

本目录的示例已经把表格「保护行列」跑通。按下面的顺序把同样的接线搬到你的服务上。每一步都能在本地看到通过或失败。

先跑示例，确认目标行为：

```bash
pnpm example:object-permissions
```

打开 <http://127.0.0.1:3010>。Alice 选中 B2:B3，点工具栏 Protection，保持默认（仅自己可编辑，其他人可以查看）并确认。换 Bob 登录，改 B2 会被服务端拒绝，改 A1 可以。换 Casey 登录，整张表都不能改。

你要达到的就是这个结果。协议和钩子不用重写，替换的是登录和「谁是这个文件的什么角色」。

## 要动的文件

| 示例文件 | 接到你的项目里时 |
| --- | --- |
| `web/main.ts` | 协同插件加上 `authzUrl`、`objectPermissionTypes`，并把当前用户的 `userID` 设成和后端一致 |
| `server/permissions.ts` | 文件角色。把内存 `Map` 换成你的用户系统 |
| `server/acl.ts` | 保护对象的存储和 `isObjectActionAllowed`。表可以换，这个函数的规则先保持 |
| `server/authz.ts` | 挂到 `authzUrl` 下面的 HTTP |
| `server/main.ts` | 身份、三个文件级钩子、`enableUnitPermissionAnalysis`、`applyChangeset` |

`server/users.ts` 里的 Cookie 只为演示。生产环境在你已有的 Session 或 Bearer 里解析出同一个 `userID`。

## 1. 前后端使用同一个 userID

后端在进协同逻辑之前写上可信用户。示例在 `server/main.ts`：

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

前端在创建 Univer 之后设置当前用户，`userID` 必须等于上面的 `context.userID`。见 `web/main.ts`：

```ts
univer.__getInjector().get(UserManagerService).setCurrentUser({
  userID: user.userId,
  name: user.username,
  avatar: user.avatar,
});
```

协同插件指向你的权限 HTTP：

```ts
authzUrl: `${location.origin}/universer-api/authz`,
objectPermissionTypes: [UnitObject.Worksheet, UnitObject.SelectRange],
```

`objectPermissionTypes` 不写的话，保护侧栏不会走这套稳定 `permissionId`。

这一步通过的标志：未登录调用协同接口得到 401；登录后，后面所有权限请求都带着这个用户，而不是浏览器里临时填的名字。

## 2. 先做文件角色

区域保护叠在文件角色上面。示例里三个人是写死的：

| userID | 角色 | 对整份文件 |
| --- | --- | --- |
| `user-alice` | creator | 可看、可编辑、可创建保护 |
| `user-bob` | editor | 可看、可编辑 |
| `user-casey` | viewer | 可看、可评论，不可编辑 |

在已有的 Collaboration Service 上挂三个钩子。`permissions` 示例和本示例都是这三行，角色函数不同：

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

`isUnitActionAllowed` 在 `server/permissions.ts`。查看者可以 View、Copy、Comment、ViewHistory，所以评论按钮是开的。编辑者还可以 Edit 以及表格结构和单元格操作。ManageCollaborator 和 Delete 只要创建者。没有列进这些集合的动作返回 false。

这一步通过的标志：Casey 改任意格子，提交被拒绝，即使你还没做区域保护。

## 3. 实现 batch_allowed

打开表格时，客户端会把权限查询合并成一次：

`POST /universer-api/authz/-/object/-/batch_allowed`

```json
{
  "requests": [
    {
      "unitID": "object-permissions-sheet",
      "objectID": "object-permissions-sheet",
      "objectType": 1,
      "actions": [0, 1, 5]
    }
  ]
}
```

`objectType: 1` 是工作簿。`objectID` 等于 `unitID` 时，按文件角色回答。示例对 Casey 的 View（0）和 Comment（5）返回 `allowed: true`，对 Edit（1）返回 `allowed: false`。

```json
{
  "error": { "code": 1, "message": "" },
  "objectActions": [
    {
      "unitID": "object-permissions-sheet",
      "objectID": "object-permissions-sheet",
      "actions": [
        { "action": 0, "allowed": true },
        { "action": 1, "allowed": false },
        { "action": 5, "allowed": true }
      ]
    }
  ]
}
```

`error.code` 为 1 表示成功。按钮灰不灰看这个响应。它不阻止别人直接提交 changeset，所以第 5 步还要在服务端再查一次。两次调用同一个函数：`server/acl.ts` 的 `isObjectActionAllowed`。

路由挂载位置在 `server/main.ts`：

```ts
app.use("/universer-api/authz", express.json({ limit: "64kb" }), createAuthzRouter({ store: acl, requireUser }));
```

## 4. 让保护侧栏能创建对象

Alice 对 B2:B3 点确认时，客户端发送：

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

`read: 1` 是所有协作者可以查看，`edit: 2` 是仅创建者可以编辑。指定 Bob 可编辑时，`edit` 改成 `0`，`collaborators` 里出现 Bob，`role` 为 `1`（Editor）。格子坐标不在这个 body 里。客户端随后用 changeset 把 B2:B3 绑到你返回的 id 上。

你保存这条 ACL，把当前用户记为创建者，并返回：

```json
{ "error": { "code": 1, "message": "" }, "objectID": "新的 permissionId" }
```

侧栏「添加人员」会请求文件成员：

`GET /universer-api/authz/collaborator?unitID=object-permissions-sheet&objectID=object-permissions-sheet`

`objectID` 与 `unitID` 相同，返回文件成员，不要返回某一块区域上的人。`id` 用 userID。示例把 `cfgEnableObjInherit` 设为 `false`。

保护侧栏会用到的路由都在 `server/authz.ts`：

| 方法 | 路径 | 何时调用 |
| --- | --- | --- |
| POST | `/-/object/-/batch_allowed` | 打开文件、刷新按钮和保护状态 |
| POST | `/-/object/list` | 读取已有保护对象 |
| POST | `/:objectType/object` | 新建区域或工作表保护 |
| PUT | `/:objectType/object/:objectId` | 改范围、改开关、改编辑名单 |
| GET | `/collaborator` | 选人框拉取候选人 |

`PUT` 时如果 `strategies` 是空数组，保持原策略，不要写成空。示例用 `body.strategies.length` 判断。选人、范围和开关都写在创建和更新里，没有单独的协作者写入接口。

工作表上的操作开关（复制、改值、插入行列等）走 `PUT`，每个动作一条 strategy：开着 `role` 为 1（Editor），关掉 `role` 为 2（Owner）。没有评论开关。

## 5. 提交时用同一函数拒绝

只做第 3、4 步时，界面会变灰，但伪造的提交仍能写入。在构造 Service 时打开分析，并在 `applyChangeset` 里逐条检查。`server/main.ts`：

```ts
const service = new UniverCollabService({
  dbAdapter: database,
  enableUnitPermissionAnalysis: true,
});

service.use("applyChangeset", async (context, next) => {
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

这个开关默认是关的。关着时 `requiredUnitPermissions` 是空数组，上面的循环不会拒绝任何人。Bob 改 B2 会成功。

打开之后，Bob 改 B2 时，其中一条 requirement 的 `objectID` 就是第 4 步返回的 `permissionId`，`action` 是 Edit。`isObjectActionAllowed` 返回 false，这次 changeset 整个被拒绝。他改 A1 时，要求落在工作簿 Edit 上，文件角色允许，写入成功。

判断规则就在 `isObjectActionAllowed`，接的时候不要拆成两套：

1. `objectID === unitID`：只看文件角色。
2. 其他动作先看文件角色。查看者连文件 Edit 都没有，区域上写了允许也没用。
3. 创建者始终是该对象的 Owner。
4. 查看：`scope.read` 为所有协作者时，文件成员可以看。
5. 编辑：`scope.edit` 为所有协作者时，文件编辑者可以改；为仅自己时，只有创建者可以改；为指定人时，只看 collaborators 里的 Editor。
6. 动作的最低角色先取对象上保存的 strategies。没有这条策略时，View、Copy、Comment、ViewHistory 默认 Reader，ManageCollaborator 和 Delete 默认 Owner，其他动作默认 Editor。

空数组表示这次提交没有解析出对象级要求。文件级的三个钩子照常执行。不要因为数组是空的就拒绝普通编辑，也不要因此拆掉第 2 步。

删掉一块保护、撤销或恢复历史时，changeset 可能再次带上原来的 `permissionId`。不要因为某一次提交里有删除，就把 ACL 行删掉。

示例不会把策略变更推给已经打开的页面。Bob 要等下一次 `batch_allowed` 或下一次提交才看到新结果。要立刻生效，就通知客户端重新拉权限，或断开他的协同连接。

## 验收

按这个顺序点一遍：

1. 未登录访问协同接口，得到 401。
2. Casey 登录后工具栏不能编辑；她提交修改，服务端 `PERMISSION_DENIED`。
3. Alice 保护 B2:B3。网络面板里有 `POST /universer-api/authz/3/object`，响应里有 `objectID`。
4. Bob 改 B2，提交被拒绝；改 A1，可以保存。
5. Alice 把 Bob 加为这块区域的编辑者。Bob 再改 B2，可以保存。
6. 重启服务后再用 Bob 打开。保护还在。角色如果还在代码里的 `Map` 中，重启也在；换成数据库时，角色表要和 ACL 表一起保留。
