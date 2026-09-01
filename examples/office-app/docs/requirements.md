# Office App 需求

状态：已确认

确认日期：2026-08-29

相关文档：[领域词汇](../CONTEXT.md) · [应用设计](./design.md)

## 目标

在 `univer-collaboration-examples` 中提供一个可独立运行的 `office-app` 示例，展示应用如何在
Collaboration SDK 之上组合真实用户、Unit 列表、固定角色权限、五类 Unit、Comments、History
和 Office 文件交换。它是教学用途的完整应用装配，不是生产办公套件。

## 功能范围

- 用户注册、登录、退出和当前用户信息。
- Sheet、Doc、Slide、Board、Base 五类 Unit 的创建、列表、打开和实时协同。
- 创建者、编辑者、查看者三种固定 Unit 角色。
- 创建者通过用户名管理已注册成员。
- Unit soft delete、回收站和恢复。
- Sheet 与 Doc Thread Comments。
- 五类 Unit 的版本 History。
- Sheet、Doc、Slide、Base 的 Office 文件导入导出。
- 产品页面和 Univer 编辑器的简体中文、英文切换。

## Unit 能力矩阵

| 能力 | Sheet | Doc | Slide | Board | Base |
| --- | --- | --- | --- | --- | --- |
| 创建、打开、实时协同 | 支持 | 支持 | 支持 | 支持 | 支持 |
| Comments | 支持 | 支持 | 暂不支持 | 暂不支持 | 暂不支持 |
| History 浏览与恢复 | 支持 | 支持 | 支持 | 支持 | 支持 |
| Office 导入 | XLS/XLSX/CSV/TSV | DOC/DOCX | PPT/PPTX | 不支持 | XLS/XLSX/CSV/TSV |
| Office 导出 | XLSX/CSV/TSV | DOCX | PPTX | 不支持 | XLSX/CSV/TSV |

应用不定义私有备份格式。Board 不显示导入、导出入口，也不以 JSON 备份冒充 Office 文件交换。

## 用户与认证

- 注册字段为用户名、显示名称、密码和确认密码。
- 用户名大小写不敏感且唯一；稳定身份始终使用服务端生成的 `userID`。
- 注册成功后自动建立登录 Session。
- 登录失败统一返回“用户名或密码错误”，不泄露用户名是否存在。
- Session 使用随机 token 和 `HttpOnly`、`SameSite=Lax` Cookie；HTTPS 下增加 `Secure`。
- 服务端只保存 token hash，不保存 Cookie 中的明文 token。
- 密码使用 scrypt 保存，不保存可逆密文或明文。
- 当前范围不包含邮箱验证、找回密码、OAuth、头像上传和用户注销。

## Unit 和成员

- 创建 Unit 或将 Office 文件导入为 Unit 的用户成为唯一创建者。
- 创建者不可转让，不能被降级或移除。
- 创建者可以按用户名添加已注册用户，并指定 Editor 或 Viewer。
- 创建者可以切换成员角色或移除成员。
- 不支持邮箱邀请、待接受邀请、公开链接、匿名访问、用户组和继承权限。
- Unit 列表只返回用户创建或作为成员加入的 Unit。
- Unit 列表区分“我创建的”和“与我共享的”，并显示当前用户角色。
- Unit 名称由应用的 `app_units` metadata 权威保存；Editor 与 Creator 可以重命名。

成员移除必须立即停止该用户对目标 Unit 的 HTTP、submit、Comments、History 和后续实时
广播访问。只在 middleware 中拒绝新写入不够：已经 JOIN 的连接也必须被 Endpoint 驱逐或
强制重新 JOIN 并重新鉴权。

## 权限矩阵

| 能力 | Creator | Editor | Viewer |
| --- | :---: | :---: | :---: |
| 出现在 Unit 列表、打开 Unit | ✓ | ✓ | ✓ |
| 查看在线成员和 Presence | ✓ | ✓ | ✓ |
| 编辑 Unit 内容 | ✓ | ✓ | — |
| 查看 Comments | ✓ | ✓ | ✓ |
| 新增、回复 Comments | ✓ | ✓ | — |
| 解决、重新打开 Comment thread | ✓ | ✓ | — |
| 编辑、删除自己的 Comment | ✓ | ✓ | — |
| 删除任意 Comment | ✓ | — | — |
| 查看 History | ✓ | ✓ | ✓ |
| 恢复 History revision | ✓ | ✓ | — |
| 导出 | ✓ | ✓ | ✓ |
| 重命名 Unit | ✓ | ✓ | — |
| 管理成员和角色 | ✓ | — | — |
| 删除、恢复 Unit | ✓ | — | — |

所有权限在服务端执行。前端隐藏或禁用操作只用于反馈，不能作为安全边界。

## Comments

- 当前只为 Sheet、Doc 注册和展示 Comment UI。
- Viewer 可以读取评论，但不能新增、回复、编辑、删除、解决或重新打开。
- Creator 和 Editor 可以新增、回复、解决及重新打开评论。
- Comment Service 保持 author-only edit 规则。
- 删除策略为 Comment 作者可以删除自己的评论，Creator 可以删除目标 Unit 中的任意评论。
- mention 目标只从当前 Unit 可见的 Creator 和成员中选择。
- Comment 用户资料由应用用户目录通过 User Provider 补全。
- 被删除 Unit 的 Comments 不可读取；Unit 恢复后重新可见。

## History

- 五类 Unit 都提供同一套应用层 History UI；它读取 History Endpoint，并通过公开
  `RevertRevisionMutation` 恢复版本。
- Creator、Editor、Viewer 都可以查看 History。
- Creator 和 Editor 可以恢复历史版本，Viewer 不可以。
- History 是 confirmed changeset 的最终一致派生索引，不是权威 revision 存储。
- 示例使用 `historyService.attach(collabService)` 便利模式；必须在 README 中说明极端崩溃窗口
  可能漏索引，生产环境应使用 transactional outbox 和显式索引 API。

## Unit 创建、删除和恢复

- “新建”菜单提供 Sheet、Doc、Slide、Board、Base。
- 每类 Unit 使用公开 SDK 数据结构创建 revision 1 空白模板。
- 删除是 soft delete：Unit 进入回收站，普通列表、读取、JOIN、submit、Comments 和 History
  均不可访问。
- 只有 Creator 可以删除和恢复。
- 当前不提供 hard delete 或清空回收站。
- 恢复后原 Unit revision、Comments、History 和成员关系继续可用。

## 导入导出

- 导入总是创建新的 Unit，不覆盖或替换现有 Unit。
- 导入用户成为 Creator，默认 Unit 名称取来源文件名，允许创建后重命名。
- XLS/XLSX/CSV/TSV 导入必须由用户选择 Sheet 或 Base，不能只按扩展名猜测。
- 导出必须物化当前 confirmed revision，不能直接导出可能落后的历史 snapshot。
- Viewer 允许导出其可读 Unit。
- 上传源文件与导出结果按用户隔离，并设置过期时间。
- Board 不显示导入导出入口；当前不调用远程专有 Exchange 服务。

## 中英文

- 支持 `zh-CN` 和 `en-US`。
- 首次注册默认语言根据浏览器语言选择，无法识别时使用 `en-US`。
- 用户可以在页面顶部切换语言，选择持久化到用户资料。
- 产品 shell、认证页、Unit 列表、成员管理、回收站、错误信息和日期格式均切换。
- Collaboration、Comments、History 和五类 Unit 插件加载对应 locale 包。
- Univer locale 在初始化时确定，切换语言时允许 dispose 并重新初始化当前编辑器。
- 语言切换不翻译已有 Unit 内容，也不修改 Unit 创建时保存的数据 locale。
- `office-app` README 同时提供英文和简体中文版本。

## 持久化

- 应用产品表与 Core Collaboration、Comment、History Adapter 共用
  `.data/office-app.sqlite`。
- 产品表使用 `app_*` 命名空间；应用不得查询、修改或迁移 SDK 管理的
  `collaboration_*` 表。
- 共用物理文件不表示不同 Repository/Adapter 的公开调用自动处于同一事务，跨领域流程仍须
  使用显式状态和启动恢复。
- Exchange 在单次认证请求内完成小文件转换，不持久化上传源文件或导出结果；需要大文件、异步
  task 或对象存储时应作为单独的生产扩展实现。

## 明确不做

- 自定义角色、逐操作权限编辑器、管理员角色和 Commenter 角色。
- 所有权转让、公开链接、匿名访问和外部邀请。
- 文件夹、全文搜索、星标、模板市场和附件对象存储。
- hard delete、跨领域物理清理和 GC。
- History transactional outbox 的生产实现。
- 多 Endpoint 进程实时 fanout。
- Board Office 导入导出和任何应用私有备份格式。
- Slide、Board、Base Comments；后续工作见 SDK roadmap。

## 验收标准

- 三个不同账号分别作为 Creator、Editor、Viewer 打开同一 Unit 时，UI 与服务端权限矩阵一致。
- Editor 和 Creator 的 confirmed changeset 能在另一个浏览器实时出现；Viewer 的写入被服务端拒绝。
- 成员移除后，既有在线连接不再收到目标 Unit 的实时消息。
- Sheet、Doc Comments 在重启和 snapshot/replay 后仍能定位并加载正文；Viewer 只能读取。
- 五类 History 都能显示贡献者和记录；Viewer 看不到恢复能力且服务端拒绝恢复提交。
- 五类 Unit 均可创建并在重启后加载；Office 交换严格符合能力矩阵。
- soft delete 后所有普通数据面拒绝访问，recover 后恢复原内容、评论、历史和成员。
- 中文和英文模式下没有缺失 key，切换后产品 shell 与 Univer 插件语言一致。
