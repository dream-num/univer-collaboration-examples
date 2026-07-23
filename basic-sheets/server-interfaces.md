# Basic Sheets 应用自定义接口

本文件只记录同时满足以下条件的服务端接口：

1. 不在 Univer Protocol 中定义；
2. 不由 Univer SDK 调用；
3. 仅服务于 Basic Sheets 应用自身。

当前 example 没有这类业务接口。

`/universer-api/user`、Unit 创建、`batch_allowed`、history 等虽然由 example
后端提供，其中部分还是 demo 代码直接调用，但都已有 Protocol 定义，统一归入
[Univer Protocol 接口索引](../../docs/internal/reference/upstream-protocol/README.md)。

## 实现归属

接口是否属于 Protocol，与是否进入协同 Endpoint 是两件事：

| 接口 | 当前实现 |
| --- | --- |
| User、Authz、Unit 创建、History | Basic Sheets 的 Express Router |
| Snapshot 读取、block/resource、fetch-missing | Node Transport → `UniverCollabEndpoint` |
| Session ticket、changeset submit | Node Transport → `UniverCollabEndpoint` |
| Comb WebSocket | Node Transport → `UniverCollabEndpoint` |

前一组回答用户、权限和产品 Unit 如何组织，属于应用能力；后一组影响协同状态、
revision、ACK 和实时投递，属于协同核心协议。

SDK 使用的 Universer 兼容路由也记录在所属 Protocol 模块的“SDK 兼容补充”中，而
不是归为 demo API，例如：

- Snapshot 的反序列化 Sheet block 路由；
- File 的 multipart upload 路由；
- Comb 的 WebSocket connect 路由。

静态页面和 Vite 构建产物的 fallback 路由不是 Univer 服务端契约，不纳入接口目录。
