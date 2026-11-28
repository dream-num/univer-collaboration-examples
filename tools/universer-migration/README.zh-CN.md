# Universer 数据迁移

[English](./README.md) | 简体中文

Universer 是 Univer 早期的协同服务端，以 Docker 镜像交付，通过 USIP 接入业务系统。新的协同能力在 Univer
Collaboration SDK 中提供。本工具面向已经在 Universer 中保存了文档、准备改用 SDK 的部署；**直接使用 SDK 的新项目
不需要它。**

本工具把 Universer 的数据迁移到 Univer Collaboration 的 PostgreSQL + S3 存储
（[`@univerjs-pro/collaboration-database-postgres-s3`](https://www.npmjs.com/package/@univerjs-pro/collaboration-database-postgres-s3)）。
迁移后每份文档的内容、编辑历史、修订号、创建者和时间都与 Universer 中一致，前端无需改动数据即可继续协同编辑。

## 适用范围

- 源端：**Universer 1.6.2**，数据库为 PostgreSQL，文件存放在 S3 兼容存储。旧版本请先按 Universer
  的升级流程升级到 1.6.2。
- 目标端：与本工具**同版本**的 Univer Collaboration SDK，版本固定在 [`package.json`](./package.json) 中
  （当前为 1.6.2）。目标是更早的 SDK 版本时，检出本仓库固定该版本的提交。
- Node.js 24 及以上，以及 pnpm。

## 迁移了什么

| 数据 | 处理方式 |
| --- | --- |
| 文档（Sheet、Doc、Slide、Board、Base、PDF） | 全部快照和全部修改记录原样迁移，修订号、作者、时间不变 |
| 单元格数据 | 写入目标存储桶，内容相同的块只存一份 |
| 图片、PDF 等文件 | 不复制，只在 SDK 文件服务中登记，文件 ID 不变 |
| 评论 | 迁移，保留作者和时间 |
| 回收站中的文档 | 迁移后仍在回收站，可以恢复 |
| 已永久删除的文档 | 不迁移，ID 写入结果文件，请勿复用 |
| 编辑历史列表 | 不迁移，SDK 首次查询时由修改记录自动生成 |
| 权限、协作者 | 不迁移，由业务系统继续提供 |

本工具只读取 Universer，不修改其中的任何数据。

## 迁移流程

工具对每份文档依次执行：

1. **读取**：从 Universer 数据库和存储桶读取全部快照、单元格数据、修改记录、评论和引用的文件。
2. **创建**：在目标端创建文档，写入第一个快照。
3. **修改记录**：按顺序写入全部修改记录，保留原始时间。
4. **快照**：写入其余快照。
5. **评论与文件**：写入评论，登记文件。
6. **校验**：从目标端读回文档，用 SDK 运行时回放到 head 修订，确认可以正常加载。
7. **回收站**：如果文档在 Universer 回收站中，在目标端同样放入回收站。

每份文档的结果写入结果文件。重复运行是安全的：已经迁移的文档只会补写缺少的修订。

## 推荐的切换步骤

1. **预迁移**：Universer 照常运行时完整迁移一次。
2. **停止写入**：停止 Universer 及协同服务，保留数据库和存储桶。
3. **增量迁移**：再运行一次，只补写预迁移之后的修改。
4. **切换**：业务前端改连 Univer Collaboration 服务。两套服务端协议相同，通常只需修改服务地址。
   SDK 的文件服务要使用 Universer 的存储桶，已迁移的文件才能继续访问。
5. **观察**：保留 Universer 的数据库和存储桶一段时间，作为回退来源。

## 使用

```bash
git clone https://github.com/dream-num/univer-collaboration-examples.git
cd univer-collaboration-examples
pnpm install

export UNIVERSER_DATABASE_URL='postgres://user:password@universer-db:5432/univer'
export UNIVERSER_S3_ENDPOINT='http://minio:9000'
export UNIVERSER_S3_BUCKET='univer'
export UNIVERSER_S3_PATH_STYLE='true' # 与 Universer 的 usePathStyle 一致（默认 false；MinIO 设为 true）
export UNIVERSER_S3_ACCESS_KEY_ID='…'
export UNIVERSER_S3_SECRET_ACCESS_KEY='…'

export TARGET_DATABASE_URL='postgres://user:password@collab-db:5432/collaboration'
export TARGET_S3_ENDPOINT='http://minio:9000'
export TARGET_S3_BUCKET='collaboration'
export TARGET_S3_PATH_STYLE='true' # 默认 false（适用于 AWS S3、阿里云 OSS）；MinIO 设为 true
export TARGET_BLOCK_PREFIX='blocks'
export TARGET_S3_ACCESS_KEY_ID='…'
export TARGET_S3_SECRET_ACCESS_KEY='…'

cd tools/universer-migration

# 先只读检查，不写入目标端
pnpm migrate --dry-run

# 正式迁移
pnpm migrate --manifest migration.jsonl
```

| 参数 | 说明 |
| --- | --- |
| `--dry-run` | 只读取和检查源数据，不写入目标端 |
| `--unit <id>` | 只迁移指定文档，可重复 |
| `--concurrency <n>` | 同时迁移的文档数，默认 4 |
| `--no-verify` | 跳过回放校验 |
| `--no-block-dedupe` | 不合并内容相同的单元格数据块 |
| `--default-creator <id>` | 创建者为空时使用的用户 ID，默认 `universer-migration` |
| `--manifest <path>` | 结果文件路径，默认 `universer-migration-manifest.jsonl` |

数据库和存储的地址也可以用对应的 `--source-*`、`--target-*` 参数传入；密钥只从环境变量读取。运行 `--help`
查看全部参数。

## 结果文件

结果文件每行是一个 JSON 对象：

- `kind: "unit"`：一份文档的结果。`status` 为 `migrated`（新迁移）、`resumed`（补写了缺少的修订）、
  `up-to-date`（无需写入）、`checked`（`--dry-run`）、`skipped`（Universer 正在永久删除）或 `failed`
  （见 `error`）。`missingFiles` 列出文档引用但 Universer 中已不存在的文件。
- `kind: "hard-deleted"`：Universer 中已永久删除的文档 ID。这些 ID 不要再用于新文档。

任何文档失败时，命令以非零状态退出。修复原因后重新运行即可，已完成的文档不会重复写入。
