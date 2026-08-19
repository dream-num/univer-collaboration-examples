# Permissions

[English](./README.md) | 简体中文

展示应用如何把可信用户身份传给协同服务，并在服务端保护 Unit 读取、实时房间和变更提交。

```bash
pnpm example:permissions
```

打开 <http://127.0.0.1:3010>。页面提供两个固定演示账号：`editor` 可以编辑，`viewer` 只能
读取。切换账号会写入本地演示 Cookie；生产应用应替换为自己的 Session 或 Bearer token。

身份读取、两种角色和所有权限检查都顺序写在 `server/main.ts`。权限判断全部发生在服务端，
前端提示不是安全边界。
