# SDK workarounds

此目录只保存已经确认属于当前 Univer SDK 基线的临时兼容逻辑。正常的应用业务、公开扩展点
和 ACL 不放在这里。

每个 workaround 必须在源码注释中写明：

- 受影响的包和版本；
- 上游行为及应用侧临时处理；
- 删除条件和正确的长期归属。

升级 SDK 后应优先验证并删除对应文件，调用方只通过具名函数引用 workaround，不能把兼容
细节重新散落到业务代码中。

当前 workaround：

- `client/base-comment-toolbar.ts`：补齐 Base 评论入口；SDK 提供标准入口后删除。
- `client/base-history-locales.ts`：补齐 Base 历史界面 locale；SDK 内置 locale 后删除。
- `server/exchange-binary.ts`：适配 Exchange 二进制响应和非 ASCII 文件名；Exchange
  Node SDK 提供同等 HTTP adapter 后删除。
