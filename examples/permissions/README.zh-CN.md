# Permissions

[English](./README.md) | 简体中文

## 概述

应用从请求里解析出当前用户，再用 Collaboration Service 的 middleware 检查文件权限：谁可以读取这份 Unit、加入房间、提交修改。角色由应用定义。SDK 提供这些钩子，不保存角色。

## 启动

```bash
pnpm example:permissions
```

打开 <http://127.0.0.1:3010>。

| 账号 | userID | 角色 | 对整份文件 |
| --- | --- | --- | --- |
| Alice | `user-alice` | 创建者 | 可看、可编辑、可管理协作者、可删除 |
| Bob | `user-bob` | 编辑者 | 可看、可编辑 |
| Casey | `user-casey` | 查看者 | 可看、可复制、可评论、可查看历史 |
| Dana | `user-dana` | 无 | 可以登录。读文件和加入房间会被拒绝 |

切换账号会写入本地演示 Cookie。应用自己从 Cookie、Session 或 token 解析出 `userID`，再交给协同服务。

协同 Unit 写入 `.data/collaboration.sqlite`，服务重启后会继续复用。角色表在 `server/permissions.ts` 的内存 `Map` 里，重启后仍在。换成数据库时，角色表要单独保留。

## 试一下

1. 以 Alice 登录，修改任意格子，可以保存。
2. 换 Casey。编辑按钮不可用。绕过界面直接提交时，服务端以 `PERMISSION_DENIED` 拒绝。
3. 换 Dana。登录成功，读取 Unit 和加入房间都被拒绝。

编辑按钮来自客户端拿到的权限查询。读文件、加入房间和提交修改由服务端 middleware 拒绝。

## SDK 与应用的边界

| SDK | 应用 |
| --- | --- |
| `readUnitData`、`submitChangeset`、`joinUnit` | 在进协同逻辑之前写入 `context.userID` |
| 客户端 `batch_allowed` 的请求格式 | 用 `isAllowed` 填写每个 `allowed` |
| 不保存角色 | `server/permissions.ts` 里的角色和动作集合 |

查看者可以 View、Copy、Comment、ViewHistory。编辑者和创建者还可以 Edit，以及表格结构和单元格操作。ManageCollaborator 和 Delete 只要创建者。没有列进这些集合的动作返回 false。`isAllowed` 同时回答 `batch_allowed` 和三个钩子。

## 接到你的服务

`server/users.ts` 里的 Cookie 只为演示。接到你的服务时，用你自己的 Cookie、Session 或 token 解析 `userID`，并把内存里的角色 `Map` 换成你的用户系统。

后端在进协同逻辑之前写上可信用户。见 `server/main.ts`：

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

协同插件把权限查询指到应用：

```ts
authzUrl: `${location.protocol}//${location.host}/universer-api/authz`,
```

在 Collaboration Service 上挂三个钩子：

```ts
service.use("readUnitData", async (context, next) => {
  if (!isAllowed(context.userID, context.request.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot read this Unit");
  await next();
});
service.use("submitChangeset", async (context, next) => {
  if (!isAllowed(context.userID, context.request.changeset.unitID, UnitAction.Edit))
    throw new CollabError("PERMISSION_DENIED", "Cannot edit this Unit");
  await next();
});
endpoint.use("joinUnit", async (context, next) => {
  if (!isAllowed(context.session.userID, context.unitID, UnitAction.View))
    throw new CollabError("PERMISSION_DENIED", "Cannot join this Unit");
  await next();
});
```

三个钩子是安全边界。客户端另外会查询权限，只用来决定工具栏和按钮是否可点。打开表格时请求：

`POST /universer-api/authz/-/object/-/batch_allowed`

```json
{
  "requests": [
    {
      "unitID": "permissions-sheet",
      "objectID": "permissions-sheet",
      "objectType": 1,
      "actions": [0, 1, 5]
    }
  ]
}
```

`objectType: 1` 是工作簿。`objectID` 等于 `unitID` 时，按文件角色回答。Casey 的 View（0）和 Comment（5）为 `allowed: true`，Edit（1）为 `allowed: false`。

```json
{
  "error": { "code": 1, "message": "" },
  "objectActions": [
    {
      "unitID": "permissions-sheet",
      "objectID": "permissions-sheet",
      "actions": [
        { "action": 0, "allowed": true },
        { "action": 1, "allowed": false },
        { "action": 5, "allowed": true }
      ]
    }
  ]
}
```

`error.code` 为 1 表示成功。按钮灰不灰看这个响应。处理函数和三个钩子调用同一个 `isAllowed`：

```ts
app.post("/universer-api/authz/-/object/-/batch_allowed", express.json(), (request, response) => {
  const user = currentUser(request);
  if (!user) return void response.sendStatus(401);
  // 对每个 action 调用 isAllowed，返回 allowed
});
```

这一步通过的标志：未登录调用协同接口得到 401。Casey 改任意格子，提交被拒绝。Dana 读文件和加入房间被拒绝。

## 说明

本示例只回答文件级检查，以及工作簿自身的 `batch_allowed`。工作表保护和区域保护叠在这层角色上面，见 [`object-permissions`](../object-permissions/README.zh-CN.md)。
