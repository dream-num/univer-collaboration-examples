# Unit 权限边界

Office App 当前使用同一个 Unit ACL 和角色策略分别控制客户端交互与服务端执行。

## 客户端权限

`POST /universer-api/authz/-/object/-/batch_allowed` 根据当前用户和 Unit/Object 返回
允许的 action。前端 SDK 使用响应初始化权限点，并控制菜单、Ribbon 和编辑交互。

该响应只是客户端能力提示，不是安全边界。客户端可以忽略或伪造结果，服务端不能据此
信任某个操作已经通过鉴权。

## 服务端权限

- Transport middleware 认证请求并提供可信 `userID`。
- Endpoint `joinUnit` middleware 控制实时房间加入，但不代替数据读取鉴权。
- Collaboration Service 的 `readUnitData`、`submitChangeset`、`deleteUnits` 和
  `recoverUnits` middleware 分别保护协同读取、提交、删除和恢复。
- Comment 和 History 使用各自的 Service middleware。
- Exchange、成员管理、Unit 重命名等普通应用 API 在各自的 Service 或路由中鉴权。

客户端 Authz 响应和服务端检查必须读取同一个 ACL/策略来源，避免界面显示与实际执行
权限不一致。当前 `creator`、`editor`、`viewer` 与 action 的映射是演示应用策略；实际
应用可以重新设计角色和权限点关系，例如新增 `commenter`。
