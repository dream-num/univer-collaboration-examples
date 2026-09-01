# Office App Context

Office App 是基于 Univer Collaboration SDK 的轻量办公应用上下文。它负责用户身份、
Unit 组织、成员权限和产品交互，同时把协同内容、评论与历史交给对应 SDK Service。

## Identity

**用户（User）**：
完成注册并拥有稳定 `userID` 的业务身份。用户名用于登录和查找，不能替代 `userID`。
_Avoid_: Account、Member、username identity

**会话（Session）**：
用户完成登录后的一段受信任访问期。会话只证明用户身份，不表达其对某个 Unit 的权限。
_Avoid_: Collaboration Session、Member

## Units and collaboration

**Unit**：
应用和 Collaboration Service 共用的办公内容身份。应用管理名称、创建者、成员和删除状态；
Collaboration Service 管理类型、revision、snapshot 和 changeset。两者使用同一个 `unitID`。
_Avoid_: Document、workspace

**创建者（Creator）**：
创建 Unit 或将 Office 文件导入为 Unit 的唯一用户，永久拥有成员管理和 Unit 生命周期权限。
_Avoid_: Owner、Admin

**编辑者（Editor）**：
由创建者加入 Unit、可以修改内容和评论的协作者。
_Avoid_: Contributor、Writer

**查看者（Viewer）**：
由创建者加入 Unit、只能读取内容和派生信息的协作者。
_Avoid_: Reader、Guest

**成员（Unit Member）**：
被创建者加入某个 Unit 的用户，角色只能是 Editor 或 Viewer；创建者不属于成员记录。
_Avoid_: Collaboration member、workspace member

**已删除 Unit（Deleted Unit）**：
已经 soft delete、当前不可读取或协作，但仍可由创建者恢复的 Unit。
_Avoid_: Permanently deleted Unit、purged Unit

## Derived capabilities

**评论线程（Comment Thread）**：
通过 thread ID 关联协同 anchor 与评论正文、回复和解决状态的产品讨论。
_Avoid_: Note、cell note

**历史记录（History Record）**：
由连续 confirmed revisions 派生的展示分组，不是 Unit revision 或 changeset 的权威存储。
_Avoid_: Snapshot、version source of truth

**导入（Import）**：
把受支持的 Office 文件转换为一个新的 Unit；导入不会覆盖现有 Unit。
_Avoid_: Restore、Open local file

**导出（Export）**：
把 Unit 当前 confirmed revision 转换为受支持的 Office 文件。
_Avoid_: Backup、snapshot download

## Localization

**界面语言（UI Locale）**：
用户选择的 `zh-CN` 或 `en-US` 产品与编辑器界面语言，不改变已有 Unit 内容。
_Avoid_: Unit locale、content translation
