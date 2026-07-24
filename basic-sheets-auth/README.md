# Basic Sheets Auth

`basic-sheets` 加入真实登录身份与 Unit 权限后的完整示例。两者使用相同的客户端
目录、URL 自动加载、SQLite Collaboration/History 和
`Transport → Endpoint → Service` 主链路；本示例只在应用边界增加：

- 与 Basic Sheets 一致的 grid Ribbon 和高级 Sheet 数据/UI 插件；公式、Pivot 和
  History 留在主线程，不创建 Worker。
- Alice、Bob 两个持久化演示用户。
- HttpOnly Cookie 中的 8 小时 JWT，`sub` 保存稳定 `userId`。
- 持久化的 `owner / editor / viewer` Unit ACL。
- Service、History 和 Endpoint middleware 权限检查。
- 登录页、当前用户和 owner 成员管理入口。

```text
client/
└── sheets/                 与 basic-sheets 相同的 Univer 装配

server/
├── application.ts          Express composition root
├── auth.ts                 JWT 与 HttpOnly Cookie
├── store.ts                SQLite 用户与 Unit ACL
├── collaboration.ts        协同、History、认证与权限 middleware
└── routes/                 Auth、User、Authz、Unit 和成员 API
```

## 启动

在仓库根目录执行：

```bash
pnpm install
pnpm --filter @univerjs/collaboration-example-basic-sheets-auth build
pnpm --filter @univerjs/collaboration-example-basic-sheets-auth start
```

打开 <http://127.0.0.1:3010>。也可以运行：

```bash
pnpm example:basic-sheets-auth
```

演示账号：

| 用户 | 密码 | 稳定 userId |
| --- | --- | --- |
| Alice | `alice-password` | `user-alice` |
| Bob | `bob-password` | `user-bob` |

直接点击登录页上的用户即可登录。Alice 创建 Sheet 后，可从右上角“成员”入口把 Bob
设为可编辑或只读；Bob 随后使用完整 `?unit=...&type=2` URL 打开同一 Sheet。

## 权限边界

| 角色 | 读取和历史 | 编辑 | 管理成员 |
| --- | --- | --- | --- |
| owner | 是 | 是 | 是 |
| editor | 是 | 是 | 否 |
| viewer | 是 | 否 | 否 |

前端 Authz 结果负责只读反馈，安全边界仍在服务端：

- Transport 验证每个协同 HTTP 请求的 JWT，并把可信 `userId` 写入 Session。
- Endpoint JOIN 前检查读取权限。
- Collaboration Service 在 create/read/submit/apply 生命周期检查 ACL。
- History Service 在读取和索引生命周期检查 ACL。
- WebSocket 不重复携带 JWT，而是消费已认证 HTTP 请求签发的一次性 ticket。

分享只支持明确添加用户，不提供匿名链接。owner 身份不可转移或删除。

## 数据与配置

用户、ACL、Unit、changeset 和 History 都位于：

```text
examples/basic-sheets-auth/.data/basic-sheets-auth.sqlite
```

因此重启服务器不会丢失权限关系。初始化或清空：

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets-auth seed
pnpm --filter @univerjs/collaboration-example-basic-sheets-auth reset
```

默认 JWT secret 仅用于本地演示。可通过 `AUTH_SECRET` 替换；生产环境还需 HTTPS、
CSRF、防暴力破解、密钥轮换和正式用户系统。

## 测试

```bash
pnpm --filter @univerjs/collaboration-example-basic-sheets-auth test
```

测试覆盖登录 Cookie、未认证协议请求、Unit/ACL/History 重启持久化、
owner/editor/viewer 服务端权限以及一次性 session ticket。
